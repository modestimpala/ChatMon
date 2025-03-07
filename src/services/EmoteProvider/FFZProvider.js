import { BaseEmoteProvider } from "./BaseEmoteProvider.js";

const FFZ_API = {
  GLOBAL: "https://api.frankerfacez.com/v1/set/global",
  CHANNEL: (channelId) => `https://api.frankerfacez.com/v1/room/id/${channelId}`,
  CDN: (url) => url.startsWith('//') ? `https:${url}` : url,
};

const EMOTE_BASE_SIZE = { width: 28, height: 28 };
const BADGE_BASE_SIZE = { width: 18, height: 18 };

export class FFZProvider extends BaseEmoteProvider {
  constructor() {
    super();
    this.globalEmotes = new Map();
    this.channelEmotes = new Map();
    this.channelBadges = new Map();
    console.log("[FFZ] Provider initialized");
  }

  async initialize() {
    try {
      console.log("[FFZ] Fetching global emotes from:", FFZ_API.GLOBAL);
      const response = await fetch(FFZ_API.GLOBAL);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch FFZ global emotes: ${response.status}`);
      }

      const json = await response.json();
      this.globalEmotes = this.parseGlobalEmotes(json);
      console.log("[FFZ] Global emotes loaded:", {
        count: this.globalEmotes.size
      });
    } catch (error) {
      console.error("[FFZ] Error initializing provider:", error);
      this.globalEmotes.clear();
    }
  }

  async getEmotes(channelId) {
    console.log("[FFZ] Getting emotes for channel:", channelId);
    
    if (this.channelEmotes.has(channelId)) {
      console.log("[FFZ] Returning cached emotes for channel:", channelId);
      return this.channelEmotes.get(channelId);
    }

    try {
      const url = FFZ_API.CHANNEL(channelId);
      console.log("[FFZ] Fetching channel emotes from:", url);
      
      const response = await fetch(url);
      if (response.status === 404) {
        console.log("[FFZ] Channel has no FFZ emotes:", channelId);
        return new Map();
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch FFZ channel emotes: ${response.status}`);
      }

      const data = await response.json();
      const { emotes, badges } = this.parseChannelData(data);
      
      this.channelEmotes.set(channelId, emotes);
      this.channelBadges.set(channelId, badges);
      
      console.log("[FFZ] Channel data loaded:", {
        channelId,
        emoteCount: emotes.size,
        badgeCount: Object.keys(badges).length
      });
      
      return emotes;
    } catch (error) {
      console.error("[FFZ] Error fetching channel emotes:", {
        channelId,
        error: error.message,
        stack: error.stack
      });
      return new Map();
    }
  }

  parseGlobalEmotes(jsonRoot) {
    const emotes = new Map();
    const defaultSets = new Set(jsonRoot.default_sets || []);

    for (const [setId, emoteSet] of Object.entries(jsonRoot.sets || {})) {
      if (!defaultSets.has(parseInt(setId))) {
        console.log("[FFZ] Skipping non-default emote set:", setId);
        continue;
      }

      this.parseEmoteSet(emoteSet, "Global", emotes);
    }

    return emotes;
  }

  parseChannelData(jsonRoot) {
    const emotes = new Map();
    const badges = {
      modBadge: this.parseAuthorityBadge(jsonRoot.room?.mod_urls, "Moderator"),
      vipBadge: this.parseAuthorityBadge(jsonRoot.room?.vip_badge, "VIP"),
      userBadges: this.parseChannelBadges(jsonRoot.room?.user_badge_ids || {})
    };

    for (const emoteSet of Object.values(jsonRoot.sets || {})) {
      this.parseEmoteSet(emoteSet, "Channel", emotes);
    }

    return { emotes, badges };
  }

  parseEmoteSet(emoteSet, kind, emoteMap) {
    for (const emoteData of emoteSet.emoticons || []) {
      const name = emoteData.name;
      const author = emoteData.owner?.display_name || "Unknown";
      
      // Use animated version if available
      const urls = emoteData.animated || emoteData.urls;
      
      const emote = this.createEmote(emoteData, urls, {
        name,
        kind,
        author,
        tooltip: `${name}<br>${kind} FFZ Emote<br>By: ${author}`
      });

      emoteMap.set(name, emote);
    }
  }

  createEmote(emoteData, urls, { name, kind, author, tooltip }) {
    const baseSize = {
      width: emoteData.width || EMOTE_BASE_SIZE.width,
      height: emoteData.height || EMOTE_BASE_SIZE.height
    };

    return {
      id: emoteData.id.toString(),
      code: name,
      imageSet: {
        "1x": FFZ_API.CDN(urls["1"] || ""),
        "2x": FFZ_API.CDN(urls["2"] || ""),
        "4x": FFZ_API.CDN(urls["4"] || ""),
      },
      baseSize,
      tooltip,
      provider: "ffz",
      kind,
      author,
      pageUrl: `https://www.frankerfacez.com/emoticon/${emoteData.id}-${name}`
    };
  }

  parseAuthorityBadge(urls, tooltip) {
    if (!urls || Object.keys(urls).length === 0) return null;

    return {
      imageSet: {
        "1x": FFZ_API.CDN(urls["1"] || ""),
        "2x": FFZ_API.CDN(urls["2"] || ""),
        "4x": FFZ_API.CDN(urls["4"] || ""),
      },
      baseSize: BADGE_BASE_SIZE,
      tooltip,
      provider: "ffz"
    };
  }

  parseChannelBadges(badgeData) {
    const badges = {};
    
    for (const [badgeId, userIds] of Object.entries(badgeData)) {
      for (const userId of userIds) {
        if (!badges[userId]) badges[userId] = [];
        badges[userId].push(parseInt(badgeId));
      }
    }

    return badges;
  }

  parseMessage(message, channelId) {
    console.log("[FFZ] Parsing message:", {
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
        const startIndex = message.indexOf(word, currentIndex);
        const endIndex = startIndex + word.length - 1;
        currentIndex = startIndex + word.length;

        console.log("[FFZ] Found emote in message:", {
          word,
          isGlobal: !!globalEmote,
          emoteId: emote.id,
          emoteName: emote.code,
          position: `${startIndex}-${endIndex}`
        });

        emotes.push({
          id: emote.id,
          code: emote.code,
          provider: "ffz",
          start: startIndex,
          end: endIndex,
          imageSet: emote.imageSet,
          baseSize: emote.baseSize,
          tooltip: emote.tooltip,
          pageUrl: emote.pageUrl,
        });
      }
    }

    console.log("[FFZ] Parsed message results:", {
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

  getBadgesForUser(channelId, userId) {
    const channelBadgeData = this.channelBadges.get(channelId);
    if (!channelBadgeData) return [];
    
    return channelBadgeData.userBadges[userId] || [];
  }
}
