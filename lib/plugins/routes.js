const compose = require('koa-compose')
const convert = require('koa-convert')
const validate = require('koa-joi')
const Router = require('koa-router')

const Mountable = require('../mountable')

const routes = function (module) {
  if (!this.config.routes) {
    return
  }

  const { root, default: routes = {} } = this.config.routes
  const router = new Router({
    prefix: root.path
  })

  Object.keys(routes).forEach(routeName => {
    const { method, path: routePath, schema, middleware: middlewareList = [] } = routes[routeName]
    // const controller = module.controller(routeName)

    // TODO add proper info log statement here: Mounting `routeName` at `baseUrl/path`
    console.log('Mounting ' + root.path + routePath)

    const routeMiddleware = module.digest(middlewareList)

    if (schema) {
      routeMiddleware.unshift(convert(validate(schema)))
    }

    router[method.toLowerCase()](routeName, routePath, ...routeMiddleware, (ctx, next) => {
      const controller = module.controller(routeName) // Lazy load controller
      return controller.call(module, ctx, next)
    })
  })

  return new Mountable(path => {
    if (path) {
      router.prefix(path)
    }
    return compose([router.routes(), router.allowedMethods()])
  })
}

module.exports = routes
