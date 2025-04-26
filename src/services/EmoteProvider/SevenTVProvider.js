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
      
      this.globalEmotes = this.parseEmoteSet(data.emotes, true);
      console.log("[7TV] Global emotes loaded:", {
        count: this.globalEmotes.size
      });
    } catch (error) {
      console.error("[7TV] Error initializing provider:", error);
      this.globalEmotes.clear();
    }
  }

  async getEmotes(channelId) {
    console.log("[7TV] Getting emotes for channel:", channelId);

    if (this.channelEmotes.has(channelId)) {
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
      
      const emoteSet = data.emote_set;
      const emotes = this.parseEmoteSet(emoteSet.emotes, false);
      this.channelEmotes.set(channelId, emotes);

      console.log("[7TV] Channel emotes loaded:", {
        channelId,
        count: emotes.size
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

      const emote = this.createEmote(activeEmote, emoteData, isGlobal);
      emoteMap.set(emote.code, emote);
    }

    return emoteMap;
  }

  createEmote(activeEmote, emoteData, isGlobal) {
      const host = emoteData.host;
      const files = host.files;
      const imageSet = {};
      
      // Track dimensions for wide emote detection
      let maxWidth = 0;
      let maxHeight = 0;
      
      // First prioritize WEBP files
      const webpFiles = files.filter(f => f.format === "WEBP");
      const filesToUse = webpFiles.length > 0 ? webpFiles : files;
      
      for (const file of filesToUse) {
          const sizeMultiplier = Math.floor(file.width / 28);
          const sizeKey = sizeMultiplier + "x";
          
          // Update max dimensions
          if (file.width > maxWidth) {
              maxWidth = file.width;
              maxHeight = file.height;
          }
          
          imageSet[sizeKey] = SEVENTV_API.CDN(host.url, file.name);
      }
      
      // Ensure 1x is available
      if (!imageSet['1x'] && Object.keys(imageSet).length > 0) {
          const firstKey = Object.keys(imageSet)[0];
          imageSet['1x'] = imageSet[firstKey];
      }
      
      const aspectRatio = maxHeight > 0 ? maxWidth / maxHeight : 1;
      const isWide = aspectRatio > 1.8;
      
      const owner = emoteData.owner || {};
      const isZeroWidth = (activeEmote.flags & (1 << 0)) !== 0;
      
      
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
          aspectRatio: aspectRatio,
          isWide: isWide,
          width: maxWidth,
          height: maxHeight
      };
      
      return emote;
  }
  

  createEmoteTooltip(name, author, isGlobal) {
    const type = isGlobal ? "Global" : "Channel";
    const authorName = author || "<deleted>";
    const tooltip = `${name}<br>${type} 7TV Emote<br>By: ${authorName}`;

    return tooltip;
  }

  parseMessage(message, channelId) {
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
        
        // Handle zero-width emotes specially
        const position = emote.zeroWidth ? startIndex : startIndex;
        
        emotes.push({
          id: emote.id,
          code: emote.code,
          provider: "7tv",
          start: position,
          end: emote.zeroWidth ? position : endIndex, // Zero-width emotes have same start/end
          imageSet: emote.imageSet,
          baseSize: emote.baseSize,
          tooltip: emote.tooltip,
          pageUrl: emote.pageUrl,
          zeroWidth: emote.zeroWidth,
          aspectRatio: emote.aspectRatio,
          isWide: emote.isWide,
          width: emote.width,
          height: emote.height
        });
      }
    }
    
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
