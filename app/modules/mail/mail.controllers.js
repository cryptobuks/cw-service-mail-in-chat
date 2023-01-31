const { _, rabbitmq, redisJson, log } = require('@cowellness/cw-micro-service')()
const gmail = require('../../lib/googleapi')
const base64url = require('base64url')

/**
 * @class MailController
 * @classdesc Controller Mail
 */
class MailController {
  /**
   * Finds a relation between two profile ids, else creates
   * @param {String} leftProfileId profileId of user A
   * @param {String} rightProfileId profileId of user B
   * @returns {Object} created/found relation
   */
  async findOrCreateRelation (leftProfileId, rightProfileId) {
    log.info('findOrCreateRelation')
    const { data: relations } = await rabbitmq.sendAndRead('/auth/relation/get', {
      profileId: leftProfileId,
      managerId: ''
    })
    const isRelated = relations.find(relation => relation.profile._id === rightProfileId)

    if (!isRelated) {
      log.info(`Relation not found between ${leftProfileId}, ${rightProfileId}, creating...`)
      const { data: relation } = await rabbitmq.sendAndRead('/auth/relation/create', {
        leftProfileId,
        rightProfileId
      })

      return relation
    }
    log.info('Relation found')
    return isRelated
  }

  /**
   * Stores the email message in chat db
   * @param {Object} payload message model data to store
   * @returns {Object} stored data
   */
  async createMailMessage (payload) {
    log.info('Sending message to chat with data: %j', payload)
    const { data } = await rabbitmq.sendAndRead('/chat/message/mailInChat/create', payload)

    log.info('Message sent to chat with data: %j', payload)
    return data
  }

  /**
   * Extracts alias from email
   * @param {*} email the email to extract alias from
   * @returns alias
   */
  getAliasFromEmail (email) {
    return _.first(email.split('@'))
  }

  /**
   * Fetches the attachment data from gmail
   * @param {String} param0 messageId, the gmail message id
   * @param {Object} param1 attachment, the attachment object in chat db
   * @returns {Object} object including base64 attachment and its information
   */
  async getAttachment ({ messageId, attachment }) {
    const key = `attachment:${attachment.attachmentId}`
    const cached = await redisJson.get(key)

    log.info('Get Attachment')
    if (cached) {
      log.info('Returning cached attachment')
      return cached
    }
    const attachmentData = await gmail.getAttachment(messageId, attachment.attachmentId)
    const decodedData = base64url.toBase64(attachmentData.data)
    const cache = {
      mimeType: attachment.mimeType,
      filename: attachment.filename,
      base64: decodedData
    }

    await redisJson.set(key, cache, { expire: 7 * 24 * 60 * 60 }) // 7 days retention

    return cache
  }

  /**
   * Gets message id from gmail messages data
   * and sends for parsing to queue
   * @param {Array} messages gmail.list response messages
   */
  async getMessages (messages) {
    const ids = messages.map(message => message.id)
    // mark all read
    await gmail.markRead(ids)
    messages.forEach(message => {
      const messageId = message.id

      log.info('Sending message id %s to queue for parse', messageId)
      rabbitmq.send('/mail-in-chat/gmail/parse', {
        messageId
      })
    })
    return true
  }

  /**
   * Finds profiles in email message body and creates messages
   * @param {Object} message parsed email message data {from, to, ...}
   * @returns {Array} messages that were created
   */
  async createMessage (message) {
    log.info('createMessage')
    const [{
      data: fromProfile
    }, {
      data: toProfiles
    }] = await Promise.all([
      rabbitmq.sendAndRead('/auth/profile/get', {
        $or: [
          {
            'person.emails.email': message.from
          },
          {
            'company.emails.email': message.from
          }
        ]
      }),
      rabbitmq.sendAndRead('/auth/profile/get', {
        'company.mailInChat.alias': [...message.toAlias, ...message.ccAlias]
      })
    ])
    log.info('fromProfile: ' + JSON.stringify(fromProfile))
    log.info('toProfiles: ' + JSON.stringify(toProfiles))
    if (!toProfiles.length) {
      log.info('TO Profiles not found with aliases %j', [...message.toAlias, ...message.ccAlias])
      return null
    }
    let fromProfileId = _.first(fromProfile)?._id

    if (!fromProfileId) {
      log.info('profile not found, creating...')
      const { data: newProfile } = await rabbitmq.sendAndRead('/auth/profile/create', {
        'person.emails': [{
          email: message.from
        }]
      })
      log.info('profile created: ' + JSON.stringify(newProfile))
      fromProfileId = newProfile._id
    }
    const validProfiles = toProfiles.filter(profile => profile._id !== fromProfileId)
    const relations = validProfiles.map(profile => this.findOrCreateRelation(fromProfileId, profile._id))
    const newRelations = await Promise.all(relations)

    log.info('relations created: ' + JSON.stringify(newRelations))

    const toProfileIds = validProfiles.map(profile => profile._id)
    const messagesList = toProfileIds.map(toProfileId => this.createMailMessage({
      fromProfileId,
      toProfileId,
      data: message
    }))

    const messages = await Promise.all(messagesList)
    log.info('messages: ' + JSON.stringify(messages))
    log.info('messages created, finished')
    return messages
  }

  /**
   * Extract message from email raw data
   * @param {String} messageId Gmail email message id
   * @returns {Array} created messages
   */
  async parseAndSave (messageId) {
    log.info('Parse message')
    const rawMessage = await gmail.get(messageId)
    const parsedMessage = gmail.parseMessage(rawMessage)
    parsedMessage.messageId = messageId
    parsedMessage.toAlias = parsedMessage.to.map(e => this.getAliasFromEmail(e))
    parsedMessage.ccAlias = parsedMessage.cc.map(e => this.getAliasFromEmail(e))

    log.info('Parsed message from email data: %j', parsedMessage)
    return this.createMessage(parsedMessage)
  }
}

module.exports = MailController
