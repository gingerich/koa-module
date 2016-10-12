const env = process.env.NODE_ENV || 'development'

const Koa = require('koa')
const mount = require('koa-mount')

const Module = require('./module')
const Mountable = require('./mountable')

class Application extends Module {

  constructor (application, config) {
    super(null, config)
    this.application = this
    this.engine = new Koa()

    this.constant('env', {
      isDevelopment () { return env === 'development' },
      isTest () { return env === 'test' }
    })
    this.constant('context', this)
  }

  context () {
    return this
  }

  compose (path = '/') {
    this.engine.use(super.compose())
    return mount(path, this.engine)
  }

  start (host, port) {
    this.engine.use(super.compose())

    this.http = this.engine.listen(port, host, () => {
      console.info(`✔ API server listening on ${host}:${port} [${process.env.NODE_ENV}]`)
    })
    return this
  }

  stop () {
    return this.http.close(err => {
      this.log.error('Failed to shutdown gracefully', err)
      throw err
    })
  }

  get (key) {
    return this._config[key]
  }

  use (fn) {
    if (fn instanceof Mountable) {
      super.use(fn)
    } else {
      this.engine.use(fn)
    }
    return this
  }

  // use (...args) {
  //   if (args[0] instanceof Mountable) {
  //     this.mountables = [...this.mountables, ...args]
  //   } else {
  //     this.engine.use(compose(...args))
  //   }
  // }

  // use (path, ...args) {
  //   let fn = (o) => o

  //   if (typeof path === 'string') {
  //     fn = mount.bind(null, path)
  //     // fn = mount(path, compose(...args))
  //   } else {
  //     args = [path, ...args]
  //     // fn = compose([path, ...args])
  //     fn = compose
  //   }

  //   if (args[0] instanceof Mountable) {
  //     args = args.map(m => m.compose())
  //   }

  //   this.engine.use(fn(compose(...args)))
  //   return this
  // }

  _mapComponentName (name) {
    return name
  }

}

exports = module.exports = Application
