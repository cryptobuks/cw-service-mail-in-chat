const path = require('path')
const basepath = path.join(__dirname, '..', 'app')

module.exports = {
  service: 'mail-in-chat',
  fastify: { active: false, port: 3010, prefix: '/api/mail-in-chat' },
  rabbitmq: { active: true, server: 'localhost:15672', user: 'dev', password: 'dev123' },
  redis: { active: false, server: 'localhost', port: 16379 },
  swagger: { active: false, exposeRoute: true },
  elasticSearch: { active: false, server: 'localhost:9200', timeout: 0, version: '7.6' },
  logger: { level: 'info' },
  options: {
    privateKey: '',
    clientEmail: '',
    inboxLabel: 'INBOX'
  },
  basepath,
  mongodb: {
    active: false,
    server: 'localhost',
    port: '37017',
    user: '',
    password: '',
    debug: true,
    databases: [
      {
        name: '',
        db: '',
        options: {}
      }
    ]
  }
}
