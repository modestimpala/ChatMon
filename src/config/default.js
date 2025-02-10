export const config = {
    port: process.env.PORT || 3000,
    twitch: {
      connection: {
        secure: true,
        reconnect: true,
      },
    },
  };
  