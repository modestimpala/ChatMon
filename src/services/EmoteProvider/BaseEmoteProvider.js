export class BaseEmoteProvider {
    constructor() {
      if (this.constructor === BaseEmoteProvider) {
        throw new Error("Cannot instantiate abstract class");
      }
    }
  
    async initialize() {
      throw new Error("Method 'initialize()' must be implemented");
    }
  
    async getEmotes(channel) {
      throw new Error("Method 'getEmotes()' must be implemented");
    }
  
    parseMessage(message, emotes) {
      throw new Error("Method 'parseMessage()' must be implemented");
    }
  }
  