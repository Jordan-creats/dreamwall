module.exports = {
  apps: [{
    name: 'wp-gallery',
    script: './server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-production',
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 3000,
    },
    max_memory_restart: '500M',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
  }],
};
