import { BaseEmoteProvider } from "./BaseEmoteProvider.js";

const SEVENTV_API = {
  GLOBAL: "https://7tv.io/v3/emote-sets/global",
  USER: (twitchId) => `https://7tv.io/v3/users/twitch/${twitchId}`,
  CDN: (url, size) => `https:${url}/${size}`,
  EMOTE_PAGE: (id) => `https://7tv.app/emotes/${id}`,
};

const EMOTE_BASE_SIZE = { width: 28, height: 28 };

export class SevenTVProvider extends BaseEmoteProvider {
  constructor() {
    super();
    this.globalEmotes = new Map();
    this.channelEmotes = new Map();
    console.log("[7TV] Provider initialized");
  }

  async initialize() {
    try {
      console.log("[7TV] Fetching global emotes from:", SEVENTV_API.GLOBAL);
      const response = await fetch(SEVENTV_API.GLOBAL);

      if (!response.ok) {
        throw new Error(`Failed to fetch 7TV global emotes: ${response.status}`);
      }

      const data = await response.json();
      console.log("[7TV] Raw global emotes response:", data);

      this.globalEmotes = this.parseEmoteSet(data.emotes, true);
      console.log("[7TV] Global emotes loaded:", {
        count: this.globalEmotes.size,
        emotes: Array.from(this.globalEmotes.entries()).map(([code, emote]) => ({
          code,
          id: emote.id,
          url: emote.imageSet["1x"],
        })),
      });
    } catch (error) {
      console.error("[7TV] Error initializing provider:", error);
      this.globalEmotes.clear();
    }
  }

  async getEmotes(channelId) {
    console.log("[7TV] Getting emotes for channel:", channelId);

    if (this.channelEmotes.has(channelId)) {
      console.log("[7TV] Returning cached emotes for channel:", channelId);
      return this.channelEmotes.get(channelId);
    }

    try {
      const url = SEVENTV_API.USER(channelId);
      console.log("[7TV] Fetching channel emotes from:", url);

      const response = await fetch(url);
      if (response.status === 404) {
        console.log("[7TV] Channel has no 7TV emotes:", channelId);
        return new Map();
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch 7TV channel emotes: ${response.status}`);
      }

      const data = await response.json();
      console.log("[7TV] Raw channel emotes response:", data);

      const emoteSet = data.emote_set;
      const emotes = this.parseEmoteSet(emoteSet.emotes, false);
      this.channelEmotes.set(channelId, emotes);

      console.log("[7TV] Channel emotes loaded:", {
        channelId,
        count: emotes.size,
        emotes: Array.from(emotes.entries()).map(([code, emote]) => ({
          code,
          id: emote.id,
          url: emote.imageSet["1x"],
        })),
      });

      return emotes;
    } catch (error) {
      console.error("[7TV] Error fetching channel emotes:", {
        channelId,
        error: error.message,
        stack: error.stack,
      });
      return new Map();
    }
  }

  parseEmoteSet(emotes, isGlobal) {
    console.log("[7TV] Parsing emote set");
    const emoteMap = new Map();

    for (const activeEmote of emotes) {
      const emoteData = activeEmote.data;
      
      // Skip unlisted emotes by default
      if (!emoteData.listed) {
        continue;
      }

      // Skip Twitch-disallowed content
      if (emoteData.flags & (1 << 24)) { // ContentTwitchDisallowed flag
        continue;
      }

      console.log("[7TV] Parsing emote:", activeEmote);
      const emote = this.createEmote(activeEmote, emoteData, isGlobal);
      emoteMap.set(emote.code, emote);
    }

    return emoteMap;
  }

  createEmote(activeEmote, emoteData, isGlobal) {
    const host = emoteData.host;
    const files = host.files.filter(f => f.format === "WEBP");
    const imageSet = {};

    // Create image set from files
    for (const file of files) {
      const size = Math.floor(file.width / 28) + "x";
      imageSet[size] = SEVENTV_API.CDN(host.url, file.name);
    }

    const owner = emoteData.owner || {};
    const isZeroWidth = (activeEmote.flags & (1 << 0)) !== 0; // ZeroWidth flag

    const emote = {
      id: activeEmote.id,
      code: activeEmote.name,
      imageSet,
      baseSize: EMOTE_BASE_SIZE,
      tooltip: this.createEmoteTooltip(
        activeEmote.name,
        owner.display_name || "",
        isGlobal
      ),
      pageUrl: SEVENTV_API.EMOTE_PAGE(activeEmote.id),
      provider: "7tv",
      isGlobal,
      zeroWidth: isZeroWidth,
    };

    console.log("[7TV] Created emote:", {
      code: emote.code,
      id: emote.id,
      isGlobal,
      urls: emote.imageSet,
    });

    return emote;
  }

  createEmoteTooltip(name, author, isGlobal) {
    const type = isGlobal ? "Global" : "Channel";
    const authorName = author || "<deleted>";
    const tooltip = `${name}<br>${type} 7TV Emote<br>By: ${authorName}`;

    console.log("[7TV] Created tooltip:", {
      emoteName: name,
      type,
      author: authorName,
      tooltip,
    });

    return tooltip;
  }

  parseMessage(message, channelId) {
    console.log("[7TV] Parsing message:", {
      message,
      channelId,
      globalEmotesCount: this.globalEmotes.size,
      channelEmotesCount: this.channelEmotes.get(channelId)?.size || 0,
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
        const startIndex = message.indexOf(word, currentIndex);
        const endIndex = startIndex + word.length - 1;
        currentIndex = startIndex + word.length;

        console.log("[7TV] Found emote in message:", {
          word,
          isGlobal: !!globalEmote,
          emoteId: emote.id,
          emoteName: emote.code,
          position: `${startIndex}-${endIndex}`,
        });

        emotes.push({
          id: emote.id,
          code: emote.code,
          provider: "7tv",
          start: startIndex,
          end: endIndex,
          imageSet: emote.imageSet,
          baseSize: emote.baseSize,
          tooltip: emote.tooltip,
          pageUrl: emote.pageUrl,
          zeroWidth: emote.zeroWidth,
        });
      }
    }

    console.log("[7TV] Parsed message results:", {
      messageLength: message.length,
      wordsCount: words.length,
      emotesFound: emotes.length,
      emotes: emotes.map((e) => ({
        code: e.code,
        position: `${e.start}-${e.end}`,
      })),
    });

    return emotes;
  }

  async updateChannelEmotes(channelId) {
    console.log("[7TV] Updating channel emotes:", channelId);
    this.channelEmotes.delete(channelId);
    const emotes = await this.getEmotes(channelId);
    console.log("[7TV] Channel emotes updated:", {
      channelId,
      newEmotesCount: emotes.size,
    });
    return emotes;
  }
}
