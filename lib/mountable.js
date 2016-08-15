class Mountable {

  constructor (compose) {
    if (typeof compose === 'function') {
      this.compose = compose
    }
  }

  mount (app, path) {
    app.use(this.compose(path))
  }

  /*
  * Return a koa middleware function
  *
  * @path optionally specify a path to prefix middleware
  */
  compose (path) {
    throw new Error('Mountable#compose is not implemented')
  }

}

exports = module.exports = Mountable
