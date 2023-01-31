const { _, log, factoryConfig } = require('@cowellness/cw-micro-service')()
const { google } = require('googleapis')
const parseMessage = require('./parseMessage')
const config = factoryConfig
console.log(config)
class Gmail {
  constructor () {
    this.authorize = this.init()
      .then(auth => {
        this.gmail = google.gmail({
          auth,
          version: 'v1'
        })
        log.info('Gmail connected')
      })
  }

  /**
   * Initializes the gmail api auth
   * @returns auth object
   */
  async init () {
    const authClient = new google.auth.JWT({
      email: config.options.clientEmail,
      key: config.options.privateKey,
      scopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify'
      ],
      subject: 'pool@sportmail.net'
    })
    await authClient.authorize()
    return authClient
  }

  /**
   * Fetch an email message by id
   * @param {Stirng} id email message id
   * @returns message data
   */
  async get (id) {
    await this.authorize
    const response = await this.gmail.users.messages.get({
      userId: 'me',
      id
    })

    return response.data
  }

  /**
   * List all unread emails
   * @returns {Array} list of all unread emails
   */
  async list () {
    await this.authorize
    const response = await this.gmail.users.messages.list({
      userId: 'me',
      labelIds: ['UNREAD', config.options.inboxLabel]
    })
    log.info('Listing messages')
    return response.data
  }

  /**
   * Mark list of messages as read in gmail
   * @param {Array} messageIds message ids to mark as read
   */
  async markRead (messageIds) {
    await this.authorize
    const response = await this.gmail.users.messages.batchModify({
      userId: 'me',
      ids: messageIds,
      removeLabelIds: ['UNREAD']
    })
    log.info('Marked all unread emails as read')
    return response.data
  }

  /**
   * Lists all labels
   */
  async getLabels () {
    await this.authorize
    const response = await this.gmail.users.labels.list({
      userId: 'me'
    })

    return response.data
  }

  /**
   * Decodes base64 data
   * @param {*} base64 base64 string data
   */
  base64ToStr (base64) {
    return Buffer.from(base64, 'base64').toString()
  }

  /**
   * Escape unnecessary characters
   * @param {String} str string to escape
   */
  escape (str) {
    return str.replace(/[\\$'"]/g, '\\$&').trim()
  }

  /**
   * Parses data from gmail message to readable form
   * @param {Object} payload raw data from gmail.get
   * @returns {Object} parsed data
   */
  parseMessage (payload) {
    log.info(JSON.stringify(payload, null, 2))
    const parsed = parseMessage(payload)
    const headers = parsed.headers
    const regexEmails = /[^@<\s]+@[^@\s>]+/g
    const from = headers.from.match(regexEmails)
    const data = {
      from: _.first(from),
      subject: headers.subject,
      date: headers.date,
      to: _.get(headers, 'to', '').match(regexEmails) || [],
      cc: _.get(headers, 'cc', '').match(regexEmails) || [],
      text: this.escape(this.base64ToStr(parsed.textPlain)),
      html: parsed.textHtml,
      attachments: _.get(parsed, 'attachments', []).map(attachment => ({
        attachmentId: attachment.attachmentId,
        mimeType: attachment.mimeType,
        filename: attachment.filename
      }))
    }

    return data
  }

  /**
   * Get data for an attachment
   * @param {String} messageId gmail message id
   * @param {String} attachmentId gmail attachment id
   * @returns attachment data
   */
  async getAttachment (messageId, attachmentId) {
    await this.authorize
    const response = await this.gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId
    })
    log.info('Getting attachment from gmail')
    return response.data
  }
}
const gmail = new Gmail()

module.exports = gmail
