const compose = require('koa-compose')
const mount = require('koa-mount')
const except = require('koa-except')

const middleware = function (module) {
  const { middleware: middlewareList = [] } = this.config
  const stack = middlewareList.map(stackable => {
    let fn = module.controller(stackable.name)

    // Skip excluded routes without invoking the middleware
    if (stackable.skip) {
      fn = except.call(fn, stackable.skip)
    }

    // Wrap middleware
    let wrapper = (ctx, next) => {
      return fn(ctx, next)
    }

    if (stackable.path) {
      wrapper = mount(stackable.path, wrapper)
    }

    return wrapper
  })

  return compose(stack)
}

module.exports = middleware
