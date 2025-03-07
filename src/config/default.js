export const config = {
    port: process.env.PORT || 3000,
    // Secure by default
  secureCookies: process.env.NODE_ENV === 'production',
  
  // For WebSocket connections
  allowedOrigins: process.env.NODE_ENV === 'production' 
    ? ['https://website.com'] 
    : ['http://localhost:3000'],

    twitch: {
      connection: {
        secure: true,
        reconnect: true,
      },
    },
  };
  
