const { getCloudinary } = require('../config/cloudinary');
const fs = require('fs');
const path = require('path');

// Allowed MIME types with corresponding formats
const ALLOWED = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
};

const MAX_SIZE = {
  image: 20 * 1024 * 1024,   // 20MB
  video: 100 * 1024 * 1024,  // 100MB
};

function validateFile(file) {
  if (!file) return { ok: false, error: '请选择文件', status: 400 };

  const isImage = ALLOWED.image.includes(file.mimetype);
  const isVideo = ALLOWED.video.includes(file.mimetype);

  if (!isImage && !isVideo) {
    return { ok: false, error: '不支持的文件类型，仅支持 JPG/PNG/WebP/GIF/MP4/WebM', status: 400 };
  }

  const maxSize = isImage ? MAX_SIZE.image : MAX_SIZE.video;
  if (file.size > maxSize) {
    const limit = isImage ? '20MB' : '100MB';
    return { ok: false, error: `文件过大，${isImage ? '图片' : '视频'}最大 ${limit}`, status: 413 };
  }

  return { ok: true, type: isImage ? 'image' : 'video' };
}

/**
 * Upload a file buffer to Cloudinary
 * @returns {{ url, public_id, width, height, format, bytes, resource_type }}
 */
async function uploadToCloudinary(filePath, mimetype, folder = 'wallpapers') {
  const cld = getCloudinary();
  if (!cld) throw new Error('Cloudinary 未配置');

  const isVideo = ALLOWED.video.includes(mimetype);
  const resourceType = isVideo ? 'video' : 'image';

  const options = {
    folder,
    resource_type: resourceType,
    use_filename: false,
    unique_filename: true,
    overwrite: false,
  };

  if (isVideo) {
    options.eager = [
      { format: 'mp4', quality: 'auto' },
      { format: 'webm', quality: 'auto' },
    ];
    options.eager_async = true;
  } else {
    // Image: auto quality, auto format, eager thumbnail
    options.quality = 'auto';
    options.fetch_format = 'auto';
    options.eager = [
      { width: 600, quality: 'auto', fetch_format: 'auto', crop: 'scale' },
    ];
  }

  const result = await cld.uploader.upload(filePath, options);

  return {
    url: result.secure_url,
    public_id: result.public_id,
    width: result.width || 0,
    height: result.height || 0,
    format: result.format || '',
    bytes: result.bytes || 0,
    resource_type: result.resource_type || resourceType,
    thumbnail: isVideo
      ? cld.url(result.public_id, { resource_type: 'video', format: 'jpg', width: 600, quality: 'auto', crop: 'scale' })
      : cld.url(result.public_id, { width: 600, quality: 'auto', fetch_format: 'auto', crop: 'scale' }),
    duration: result.duration || 0,
  };
}

/**
 * Delete a Cloudinary resource by public_id
 */
async function deleteFromCloudinary(publicId, resourceType = 'image') {
  const cld = getCloudinary();
  if (!cld) return;
  try {
    await cld.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.error('[cloudinary] 删除失败:', publicId, err.message);
  }
}

module.exports = { validateFile, uploadToCloudinary, deleteFromCloudinary, ALLOWED, MAX_SIZE };
