'use strict'

const axios = require('axios')
const isFunction = require('lodash.isfunction')

// Action Types
const CALL_API = 'api/CALL_API'
const CHAIN_API = 'api/CHAIN_API'
const CONCURRENT_API = 'api/CONCURRENT_API'

function extractParams(callApi) {
  const {
    method,
    path,
    url,
    query,
    body,
    successType,
    errorType,
    afterSuccess,
    afterError,
  } = callApi

  return {
    method,
    url: url || path,
    query,
    body,
    successType,
    errorType,
    afterSuccess,
    afterError,
  }
}

function actionWith(action, toMerge) {
  const ret = Object.assign({}, action, toMerge)
  delete ret[CALL_API]
  return ret
}

function createRequestPromise(apiActionCreator, next, getState, dispatch) {
  return (prevBody) => {
    const apiAction = apiActionCreator(prevBody)
    const params = extractParams(apiAction[CALL_API])
    const config = {
      method: params.method,
      url: params.url,
      data: params.body,
      params: params.query,
    }
    return new Promise((resolve, reject) => {
      const handleError = err => {
        if (params.errorType) {
          dispatch(actionWith(apiAction, {
            type: params.errorType,
            err,
          }))
        }
        if (typeof params.afterError === 'function') {
          params.afterError({ getState, err })
        }
        resolve({ err })
      }
      axios
        .request(config)
        .then(res => {
          if (res.status !== 200) {
            handleError(res.data.status_message)
            return
          }

          if (params.successType) {
            dispatch(actionWith(apiAction, {
              type: params.successType,
              res: res.data,
            }))
          }
          if (typeof params.afterSuccess === 'function') {
            params.afterSuccess({ getState, res: res.data })
          }
          resolve({ res: res.data })
        })
        .catch(err => {
          handleError(err)
        })
    })
  }
}

const apiMiddleware =  ({ dispatch, getState }) => next => action => {
  if (action[CALL_API]) {
    return dispatch({
      [CHAIN_API]: [
        () => action,
      ],
    })
  }

  return new Promise((resolve, reject) => {
    if (!action[CHAIN_API] && !action[CONCURRENT_API]) {
      return next(action)
    }

    if (action[CHAIN_API]) {
      const promiseCreators = action[CHAIN_API].map((apiActionCreator) => {
        return createRequestPromise(apiActionCreator, next, getState, dispatch)
      })
      return promiseCreators
        .reduce((promise, creator) => {
          return promise.then((body) => {
            return creator(body)
          })
        }, Promise.resolve())
        .then(resolve)
        .catch(reject)
    }

    const requestPromises = action[CONCURRENT_API].map((apiActionCreator) => {
      return createRequestPromise(apiActionCreator, next, getState, dispatch)()
    })

    return Promise.all(requestPromises)
      .then(resolve)
      .catch(reject)
  })
}

module.exports = apiMiddleware

module.exports.CALL_API = CALL_API
module.exports.CHAIN_API = CHAIN_API
module.exports.CONCURRENT_API = CONCURRENT_API
