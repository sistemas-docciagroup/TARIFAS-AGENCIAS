module.exports = {
  apps: [
    {
      name: "doccia-ai",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/server.ts",
      cwd: "C:/Users/alfonsop/Documents/doccia-ai",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
