# Twitch Chat Monitor

A web-based Twitch chat viewer with support for BTTV, FFZ, and 7TV emotes.

## Features

- Real-time chat monitoring
- Full emote support (Twitch, BTTV, FFZ, 7TV)
- Twitch badges
- User colors
- Emote caching

This specific project aims to be compatible with older browsers, such as ones found in UE4's Web Browser Widget. As such, it does not use many modern features. The server handles the Twitch connection and emote fetching, while the client is a simple HTML page that connects to the server via WebSockets. The server then forwards messages to the client and the client renders them. 

## Setup

```bash
npm install
```

Create `config/default.js`:
```javascript
export const config = {
  twitch: {
    connection: {
      secure: true,
      reconnect: true
    }
  }
};
```

```bash
npm start
```


## License

MIT