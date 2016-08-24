const env = process.env.NODE_ENV
const Bottle = require('bottlejs')
const compose = require('koa-compose')
const EventEmitter = require('events')
const requireDir = require('require-directory')
const _get = require('lodash.get')

const Mountable = require('./mountable')

class Module extends Mountable {

  constructor (application, config = {}) {
    super()
    this.application = application
    this.bottle = new Bottle()
    this.mountables = []

    config.get = _get.bind(null, config)
    this.bottle.constant('config', config)

    this.bottle.constant('env', {
      isDevelopment () { return env === 'development' },
      isTest () { return env === 'test' }
    })

    const _this = this
    this.bottle.service('context', function () { return _this.context() })
  }

  compose (path) {
    return compose(this.mountables.map(m => m.compose(path)))
  }

  use (mountable) {
    if (typeof mountable === 'function') {
      // Assume mountable is already a valid middleware function
      mountable = new Mountable(function () { return this }.bind(mountable))
    }
    if (!(mountable instanceof Mountable)) {
      throw new TypeError('mountable must be an instance of Mountable')
    }
    this.mountables.push(mountable)
    return this
  }

  context () {
    return this.application
  }

  load () {
    return new Loader(this).load()
  }

  get dirname () {
    throw new Error('Module.dirname getter must be defined in subclass')
  }

  onLoad (mod) {
    return mod
  }

  component (name) {
    const component = this.bottle.container[this._mapComponentName(name)]
    if (!component) {
      throw new Error('No component registered as, ' + name)
    }
    return component
  }

  controller (name, fn, ...deps) {
    if (!fn) {
      return this.component(name)
    }

    this.bottle.service(name, function (...resolvedDeps) {
      return (ctx, next) => fn(ctx, next, ...resolvedDeps)
    }, ...deps)
  }

  service (name, ...args) {
    if (!args.length) {
      return this.component(name)
    }

    this.bottle.service(name, ...args)
    return this
  }

  factory (name, ...args) {
    this.bottle.factory(this._mapComponentName(name), ...args)
    return this
  }

  provider (name, ...args) {
    this.bottle.provider(this._mapComponentName(name), ...args)
    return this
  }

  decorator (name, ...args) {
    this.bottle.decorator(this._mapComponentName(name), ...args)
    return this
  }

  constant (name, ...args) {
    this.bottle.constant(this._mapComponentName(name), ...args)
    return this
  }

  value (name, ...args) {
    this.bottle.value(this._mapComponentName(name), ...args)
    return this
  }

  defer (name, ...args) {
    this.bottle.defer(this._mapComponentName(name), ...args)
    return this
  }

  resolve (name, ...args) {
    this.bottle.resolve(this._mapComponentName(name), ...args)
    return this
  }

  digest (name, ...args) {
    return this.bottle.digest(this._mapComponentName(name), ...args)
  }

  _mapComponentName (name) {
    return name
    // return [this.name, name].join('.')
  }

}

class Loader extends EventEmitter {

  constructor (m, opts) {
    super()
    this.module = m
    this._plugins = {}

    this.use('middleware', require('./plugins/middleware'))
    this.use('routes', require('./plugins/routes'))

    this.opts = Object.assign({}, {
      include: /^([^\.].+)\.js(on)?$/,
      exclude: new RegExp(`(^${m.dirname}/node_modules)|index\.js`),
      recursive: true,
      visit: this.resolve.bind(this.module),
      rename: name => name.replace(/(_\w)/g, m => m[1].toUpperCase())  // snake_case to camelCase
    }, opts)
  }

  use (name, fn) {
    this._plugins[name] = fn
    return this
  }

  load () {
    try {
      const components = requireDir(module, this.module.dirname, this.opts)
      this.module.components = Object.assign({}, this.module.components, components)

      Object.keys(this._plugins).forEach(name => {
        const plugin = this._plugins[name]
        if (typeof plugin !== 'function') {
          throw new Error('plugin must be a function')
        }
        this.module.use(plugin.call(this.module.components, this.module))
        this.emit(name, this.module)
      })

      this.module.onLoad(this.module)
      return this.module
    } catch (err) {
      throw err
    }
  }

  resolve (cmpnt, path, filename) {
    return typeof cmpnt === 'function' ? cmpnt(this) : cmpnt
  }
}

exports = module.exports = Module
exports.Loader = Loader
