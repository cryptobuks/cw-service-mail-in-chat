const { ctr, rabbitmq } = require('@cowellness/cw-micro-service')()
const gmail = require('../../lib/googleapi')

rabbitmq.consume('/mail-in-chat/gmail/fetch', async () => {
  const list = await gmail.list()

  return ctr.mail.getMessages(list.messages)
})

rabbitmq.consume('/mail-in-chat/attachment/get', async ({ data }) => {
  return ctr.mail.getAttachment(data)
})

rabbitmq.consume('/mail-in-chat/gmail/parse', async ({ data }) => {
  const messageId = data.messageId

  return ctr.mail.parseAndSave(messageId)
}, {
  // prefetch: 1
})

/**
 * schedule gmail fetch cron every 30 seconds
 */
rabbitmq.send('/cron/append', {
  name: 'mailInChat:gmail:fetch',
  type: 'cron',
  update: true,
  crontab: '*/30 * * * * *',
  commands: [{
    type: 'rabbitmq',
    queue: '/mail-in-chat/gmail/fetch',
    msg: 'inbox'
  }]
})
