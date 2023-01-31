/**
 * Takes the header array filled with objects and transforms it into a more
 * pleasant key-value object.
 * @param  {array} headers
 * @return {object}
 */
function indexHeaders (headers) {
  if (!headers) {
    return {}
  } else {
    return headers.reduce(function (result, header) {
      result[header.name.toLowerCase()] = header.value
      return result
    }, {})
  }
}

/**
 * Takes a response from the Gmail API's GET message method and extracts all
 * the relevant data.
 * @param  {object} response
 * @return {object}
 */
module.exports = function parseMessage (response) {
  const result = {
    id: response.id,
    threadId: response.threadId,
    labelIds: response.labelIds,
    snippet: response.snippet,
    historyId: response.historyId
  }
  if (response.internalDate) {
    result.internalDate = parseInt(response.internalDate)
  }

  const payload = response.payload
  if (!payload) {
    return result
  }

  let headers = indexHeaders(payload.headers)
  result.headers = headers

  let parts = [payload]
  let firstPartProcessed = false

  while (parts.length !== 0) {
    const part = parts.shift()
    if (part.parts) {
      parts = parts.concat(part.parts)
    }
    if (firstPartProcessed) {
      headers = indexHeaders(part.headers)
    }

    if (!part.body) {
      continue
    }

    const isHtml = part.mimeType && part.mimeType.indexOf('text/html') !== -1
    const isPlain = part.mimeType && part.mimeType.indexOf('text/plain') !== -1
    const isAttachment = Boolean(part.body.attachmentId || (headers['content-disposition'] && headers['content-disposition'].toLowerCase().indexOf('attachment') !== -1))
    const isInline = headers['content-disposition'] && headers['content-disposition'].toLowerCase().indexOf('inline') !== -1

    if (isHtml && !isAttachment) {
      result.textHtml = part.body.data
    } else if (isPlain && !isAttachment) {
      result.textPlain = part.body.data
    } else if (isAttachment) {
      const attachmentBody = part.body
      if (!result.attachments) {
        result.attachments = []
      }
      result.attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        size: attachmentBody.size,
        attachmentId: attachmentBody.attachmentId,
        headers: indexHeaders(part.headers)
      })
    } else if (isInline) {
      const body = part.body
      if (!result.inline) {
        result.inline = []
      }
      result.inline.push({
        filename: part.filename,
        mimeType: part.mimeType,
        size: body.size,
        attachmentId: body.attachmentId,
        headers: indexHeaders(part.headers)
      })
    }

    firstPartProcessed = true
  }

  return result
}
