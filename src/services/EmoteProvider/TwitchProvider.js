import { BaseEmoteProvider } from "./BaseEmoteProvider.js";

export class TwitchProvider extends BaseEmoteProvider {
  constructor() {
    super();
  }

  async initialize() {
    // Implement me
  }

  parseMessage(message, emotes) {
    if (!emotes) return [];

    const emoteArray = [];
    for (const [id, positions] of Object.entries(emotes)) {
      positions.forEach((position) => {
        const [start, end] = position.split("-").map(Number);
        const code = message.slice(start, end + 1);
        emoteArray.push({
          start,
          end,
          provider: "twitch",
          emoteId: id,
          code,
        });
      });
    }

    return emoteArray;
  }
}
