const IoC = require('electrolyte')
const logger = require('winston')

const Module = require('./lib/module')
const DummyLoader = Module.DummyLoader

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
      console.error(ex)
      return
    }
  }
}

// Source a named electrolyte component directly
IoC.component = function (name, fn, ...deps) {
  try {
    return function (id) {
      return id === name && Object.assign(fn, { '@require': deps, '@singleton': true })
    }
  } catch (err) {
    console.error(err)
    throw err
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

  constructor (name, fn, ...deps) {
    this.component = Object.assign((context, config, ...resolved) => {
      return resolved.reduce((mod, submodule) => mod.use(submodule), fn(context, config).load())
    }, {
      '@require': ['context', `config/${name}`],
      '@singleton': true,
      _name: name
    })

    this.use(...deps)

    this.component.path = this.path.bind(this)
    this.component.use = this.use.bind(this)
    this.component.require = this.require.bind(this)
    return this.component
  }

  path (path) {
    IoC.use(IoC.es6(IoC.dir(path)))
    return this.component
  }

  use (...deps) {
    const names = deps.map(({ name, config }) => {
      const cmpnt = typeof config === 'string'
        ? IoC.component(name, c => c[config], `config/${this.component._name}`)
        : IoC.literal(name, config)
      IoC.use('config', cmpnt)
      return name
    })
    this.component['@require'].push(...names)
    return this.component
  }

  require (name) {
    this.component['@require'].push(name)
    return this.component
    // One module may depend on a service defined in another
    // There should be a way to specify dependency on
    // another module without implicitely mounting it as
    // as submodule, which is the current behaviour of use()
  }

}

function modules (mod, opts) {
  opts = Object.assign({}, DEFAULTS, opts)
  const { name } = mod
  const Container = IoC // new IoC.Container()
  Container.use(IoC.es6(IoC.node_modules(module.parent)))

  Container.use(IoC.literal('context', mod.context()))
  Container.use('config', IoC.literal(name, mod.context().config))

  if (typeof opts.path === 'string') {
    opts.path = [opts.path]
  }
  opts.path.forEach(path => Container.use(IoC.es6(IoC.dir(path))))

  const deps = opts.modules.map(d => {
    d = typeof d === 'string' ? { name: d } : d
    d.config = typeof d.config === 'object' ? d.config : mod.context().get(d.config)
    d.config.path = d.path
    Container.use('config', IoC.literal(d.name, d.config))
    return d
  })

  // Container.use(IoC.component(name, (...resolved) => {
  //   return resolved.reduce((m, fn, i) => {
  //     const submodule = fn(deps[i].config).load()
  //     submodule.use(modules(submodule, { path: fn.paths, modules: fn.dependencies }))
  //     return m.use(submodule.compose(deps[i].path))
  //   }, new Module())
  //   // return resolved.reduce((m, r, i) => m.use(r.compose()), new Module())
  // }, ...deps.map(d => d.name)))
  Container.use(function (id) {
    return id === name && register(name, () => new DummyLoader(new Module()), ...deps)
  })
  return Container.create(name).compose()
}

function register (name, fn, ...deps) {
  return new Component(name, fn, ...deps)
}

exports = module.exports = modules
exports.register = register
exports.Application = require('./lib/application')
exports.Module = require('./lib/module')
