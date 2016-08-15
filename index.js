const IoC = require('electrolyte')
const logger = require('winston')

const Module = require('./lib/module')

const DEFAULTS = {
  path: [],
  modules: []
}

// Source from /node_modules of given parent module
IoC.node_modules = function (parent) {
  return function (id) {
    try {
      return parent.require(id)
    } catch (ex) {
      return
    }
  }
}

// Source a named electrolyte component directly
IoC.component = function (name, fn, ...deps) {
  return function (id) {
    return id === name && Object.assign(fn, { '@require': deps, '@singleton': true })
  }
}

// Source the passed object as is
IoC.literal = function (name, obj) {
  return function (id) {
    return id === name && Object.assign(function () {
      return obj
    }, { '@singleton': true })
  }
}

// Wraps source to provide es6 import/export compatibility
IoC.es6 = function (source) {
  return function (id) {
    var mod = source(id)
    return (mod && mod.default) || mod
  }
}

class Component {

  constructor (fn, ...deps) {
    this.component = Object.assign(context => {
      const factory = fn.bind(null, context)
      factory.paths = this.component.paths
      factory.dependencies = this.component.dependencies
      return factory
    }, {
      '@require': ['context'],
      '@singleton': true,
      paths: [],
      dependencies: deps
    })
    this.component.use = this.use.bind(this)
    return this.component
  }

  use (path, ...deps) {
    if (path) {
      this.component.paths.push(path)
    }
    this.component.dependencies.push(...deps)
    return this.component
  }

}

function modules (mod, opts) {
  opts = Object.assign({}, DEFAULTS, opts)
  const Container = new IoC.Container()
  Container.use(IoC.es6(IoC.node_modules(module.parent)))

  Container.use(IoC.literal('context', mod.context()))

  if (typeof opts.path === 'string') {
    opts.path = [opts.path]
  }
  opts.path.forEach(path => Container.use(IoC.es6(IoC.dir(path))))

  const deps = opts.modules.map(d => {
    d = typeof d === 'string' ? { name: d } : d
    d.config = typeof d.config === 'object' ? d.config : mod.context().get(d.config)
    Container.use('config', IoC.literal(d.name, d.config))
    return d
  })

  const name = mod.name || 'module'
  Container.use(IoC.component(name, (...resolved) => {
    return resolved.reduce((m, fn, i) => {
      const submodule = fn(deps[i].config).load()
      submodule.use(modules(submodule, { path: fn.paths, modules: fn.dependencies }))
      return m.use(submodule.compose(deps[i].path))
    }, new Module())
    // return resolved.reduce((m, r, i) => m.use(r.compose()), new Module())
  }, ...deps.map(d => d.name)))
  return Container.create(name).compose()
}

function register (fn, ...deps) {
  return new Component(fn, ...deps)
}

exports = module.exports = modules
exports.register = register
exports.Application = require('./lib/application')
exports.Module = require('./lib/module')
