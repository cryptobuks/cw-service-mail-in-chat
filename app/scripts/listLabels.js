process.env.NODE_ENV = 'production'
const config = require('config')
config.fastify.port = 0
const cw = require('@cowellness/cw-micro-service')(config)
cw.autoStart().then(async () => {
  const gmail = require('../lib/googleapi')
  gmail.getLabels().then(response => {
    console.log(response.labels)
    console.log('finished')
    process.exit()
  })
})
