import { BaseEmoteProvider } from "./BaseEmoteProvider.js";

const BTTV_API = {
  GLOBAL: "https://api.betterttv.net/3/cached/emotes/global",
  CHANNEL: (channelId) => `https://api.betterttv.net/3/cached/users/twitch/${channelId}`,
  CDN: (id, size) => `https://cdn.betterttv.net/emote/${id}/${size}`,
  EMOTE_PAGE: (id) => `https://betterttv.com/emotes/${id}`,
};

const EMOTE_BASE_SIZE = { width: 28, height: 28 };

export class BTTVProvider extends BaseEmoteProvider {
  constructor() {
    super();
    this.globalEmotes = new Map();
    this.channelEmotes = new Map();
    console.log("[BTTV] Provider initialized");
  }

  async initialize() {
    try {
      console.log("[BTTV] Fetching global emotes from:", BTTV_API.GLOBAL);
      const response = await fetch(BTTV_API.GLOBAL);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch BTTV global emotes: ${response.status}`);
      }

      const emotes = await response.json();

      this.globalEmotes = this.parseGlobalEmotes(emotes);
      console.log("[BTTV] Global emotes loaded:", {
        count: this.globalEmotes.size
      });
    } catch (error) {
      console.error("[BTTV] Error initializing provider:", error);
      this.globalEmotes.clear();
    }
  }

  async getEmotes(channelId) {
    console.log("[BTTV] Getting emotes for channel:", channelId);
    
    if (this.channelEmotes.has(channelId)) {
      console.log("[BTTV] Returning cached emotes for channel:", channelId);
      return this.channelEmotes.get(channelId);
    }

    try {
      const url = BTTV_API.CHANNEL(channelId);
      console.log("[BTTV] Fetching channel emotes from:", url);
      
      const response = await fetch(url);
      if (response.status === 404) {
        console.log("[BTTV] Channel has no BTTV emotes:", channelId);
        return new Map();
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch BTTV channel emotes: ${response.status}`);
      }

      const data = await response.json();
     
      const emotes = this.parseChannelEmotes(data);
      this.channelEmotes.set(channelId, emotes);
      
      console.log("[BTTV] Channel emotes loaded:", {
        channelId,
        count: emotes.size
      });
      
      return emotes;
    } catch (error) {
      console.error("[BTTV] Error fetching channel emotes:", {
        channelId,
        error: error.message,
        stack: error.stack
      });
      return new Map();
    }
  }

  parseGlobalEmotes(jsonEmotes) {
    console.log("[BTTV] Parsing global emotes");
    const emotes = new Map();

    for (const jsonEmote of jsonEmotes) {
      const emote = this.createEmote(jsonEmote, {
        isGlobal: true,
        tooltip: `${jsonEmote.code}<br>Global BetterTTV Emote`,
      });
      emotes.set(emote.code, emote);
    }

    return emotes;
  }

  parseChannelEmotes(jsonRoot) {
    console.log("[BTTV] Parsing channel emotes");
    const emotes = new Map();
    const channelName = jsonRoot.channelDisplayName || "Unknown Channel";

    console.log("[BTTV] Channel name:", channelName);
    console.log("[BTTV] Channel emotes count:", jsonRoot.channelEmotes?.length || 0);
    console.log("[BTTV] Shared emotes count:", jsonRoot.sharedEmotes?.length || 0);

    // Parse channel emotes
    for (const jsonEmote of [...(jsonRoot.channelEmotes || []), ...(jsonRoot.sharedEmotes || [])]) {
      //console.log("[BTTV] Parsing channel emote:", jsonEmote);
      const emote = this.createEmote(jsonEmote, {
        isGlobal: false,
        tooltip: this.createChannelEmoteTooltip(jsonEmote, channelName),
      });
      emotes.set(emote.code, emote);
    }

    return emotes;
  }

  createEmote(jsonEmote, { isGlobal, tooltip }) {
    const emote = {
      id: jsonEmote.id,
      code: jsonEmote.code,
      imageSet: {
        "1x": BTTV_API.CDN(jsonEmote.id, "1x"),
        "2x": BTTV_API.CDN(jsonEmote.id, "2x"),
        "3x": BTTV_API.CDN(jsonEmote.id, "3x"),
      },
      baseSize: EMOTE_BASE_SIZE,
      tooltip,
      pageUrl: BTTV_API.EMOTE_PAGE(jsonEmote.id),
      provider: "bttv",
      isGlobal,
    };

    return emote;
  }

  createChannelEmoteTooltip(jsonEmote, channelName) {
    const author = jsonEmote.user?.displayName || "";
    const type = author ? "Shared" : "Channel";
    const authorName = author || channelName;
    const tooltip = `${jsonEmote.code}<br>${type} BetterTTV Emote<br>By: ${authorName}`;


    return tooltip;
  }

  parseMessage(message, channelId) {
        console.log("[BTTV] Parsing message:", {
            message,
            channelId,
            globalEmotesCount: this.globalEmotes.size,
            channelEmotesCount: this.channelEmotes.get(channelId)?.size || 0
        });

        const emotes = [];
        const words = message.split(" ");
        const channelEmotes = this.channelEmotes.get(channelId) || new Map();

        let currentIndex = 0;
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const globalEmote = this.globalEmotes.get(word);
            const channelEmote = channelEmotes.get(word);
            const emote = globalEmote || channelEmote;

            if (emote) {
                // Find the actual position of this word in the message
                const startIndex = message.indexOf(word, currentIndex);
                const endIndex = startIndex + word.length - 1;
                
                // Update currentIndex to continue searching from after this word
                currentIndex = startIndex + word.length;

                console.log("[BTTV] Found emote in message:", {
                    word,
                    isGlobal: !!globalEmote,
                    emoteId: emote.id,
                    emoteName: emote.code,
                    position: `${startIndex}-${endIndex}`
                });

                emotes.push({
                    id: emote.id,
                    code: emote.code,
                    provider: "bttv",
                    start: startIndex,
                    end: endIndex,
                    imageSet: emote.imageSet,
                    baseSize: emote.baseSize,
                    tooltip: emote.tooltip,
                    pageUrl: emote.pageUrl,
                });
            }
        }

        console.log("[BTTV] Parsed message results:", {
            messageLength: message.length,
            wordsCount: words.length,
            emotesFound: emotes.length,
            emotes: emotes.map(e => ({
                code: e.code,
                position: `${e.start}-${e.end}`
            }))
        });

        return emotes;
    }


  async updateChannelEmotes(channelId) {
    console.log("[BTTV] Updating channel emotes:", channelId);
    this.channelEmotes.delete(channelId);
    const emotes = await this.getEmotes(channelId);
    console.log("[BTTV] Channel emotes updated:", {
      channelId,
      newEmotesCount: emotes.size
    });
    return emotes;
  }
}
