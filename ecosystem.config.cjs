module.exports = {
  apps: [
    {
      name: 'krista-explorer',
      script: '.output/server/index.mjs',
      cwd: '/home/bedri/KristaTech-Explorer',
      env: {
        NODE_ENV: 'production',
        PORT: '27799',
        HOST: '127.0.0.1',
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: '27799'
      }
    }
  ]
}
