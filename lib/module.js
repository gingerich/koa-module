const Bottle = require('bottlejs')
const compose = require('koa-compose')
const EventEmitter = require('events')
const requireDir = require('require-directory')
const get = require('lodash.get')

Bottle.config.strict = true

const Mountable = require('./mountable')

class Module extends Mountable {

  constructor (application, config = {}) {
    super()
    this.application = application
    this.bottle = new Bottle()
    this.mountables = []

    config.get = get.bind(null, config)
    this._config = config

    ;['constant', 'decorator', 'factory',
      'middleware', 'provider', 'value'].map(method => this[method] = (name, ...args) => {
        this.context().bottle[method](this._mapComponentName(name), ...args)
        return this
      })
    ;['defer', 'resolve'].map(method => {
      this[method] = (...args) => this.context().bottle[method](...args)
      return this
    })
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

  // DEPRECATED use this.digest() instead
  component (name) {
    const component = get(this.context().bottle.container, this._mapComponentName(name))
    if (!component) {
      throw new Error('No component registered as, ' + name)
    }
    return component
  }

  controller (name, fn, ...deps) {
    if (!fn) {
      return this.digest(name)
    }

    return this.service(name, function (...resolvedDeps) {
      return (ctx, next) => fn(ctx, next, ...resolvedDeps)
    }, ...deps)
  }

  service (name, fn, ...deps) {
    if (!fn) {
      return this.digest(name)
    }

    this.context().bottle.service(this._mapComponentName(name), fn, ...deps)
    return this
  }

  digest (services) {
    return typeof services === 'string'
      ? this.context().bottle.digest([this._mapComponentName(services)])[0] // Digest and return a single service
      : this.context().bottle.digest(services.map(name => this._mapComponentName(name)))
  }

  _mapComponentName (name) {
    return /.+\..+/.test(name) ? name : `${this.name}.${name}`
    // return [this.name, name].join('.')
  }

}

class Loader extends EventEmitter {

  constructor (m, opts) {
    super()
    this.module = m
    this.plugins = []

    this.use('config', mod => { mod.constant('config', mod._config) })
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

  use (name, plugin) {
    this.plugins.push({ name, plugin })
    return this
  }

  load () {
    try {
      const components = requireDir(module, this.module.dirname, this.opts)
      this.module.components = Object.assign({}, this.module.components, components)

      this.plugins.forEach(({ name, plugin }) => {
        if (typeof plugin !== 'function') {
          throw new Error('plugin must be a function')
        }
        const plugged = plugin.call(this.module.components, this.module)
        if (plugged) {
          this.module.use(plugged)
        }
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
