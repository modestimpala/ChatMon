import tmi from "tmi.js";
import { TwitchProvider } from "./EmoteProvider/TwitchProvider.js";
import { BTTVProvider } from "./EmoteProvider/BTTVProvider.js";
import { FFZProvider } from "./EmoteProvider/FFZProvider.js";
import { SevenTVProvider } from "./EmoteProvider/SevenTVProvider.js";
import { TwitchBadgeProvider } from "./BadgeProvider/TwitchBadgeProvider.js";
import { EmoteCacheManager } from "./EmoteCacheManager.js"
import { config } from "../config/default.js";

export class TwitchChatManager {
    constructor() {
        this.clients = new Map();
        this.twitchEmoteProvider = new TwitchProvider();
        this.badgeProvider = new TwitchBadgeProvider();
        this.bttvProvider = new BTTVProvider();
        this.ffzProvider = new FFZProvider();
        this.sevenTVProvider = new SevenTVProvider();

        // Initialize the cache manager with 30 minute cache duration
        this.emoteCacheManager = new EmoteCacheManager({
            cacheDuration: 30 * 60 * 1000 // 30 minutes
        });

        this.initialize();
    }

    async initialize() {
        // Initialize all providers
        await Promise.all([
            this.badgeProvider.initialize(),
            this.bttvProvider.initialize(),
            this.twitchEmoteProvider.initialize(),
            this.ffzProvider.initialize(),
            this.sevenTVProvider.initialize()
        ]);

        // Register providers with cache manager
        this.emoteCacheManager.registerProvider('bttv', this.bttvProvider);
        this.emoteCacheManager.registerProvider('ffz', this.ffzProvider);
        this.emoteCacheManager.registerProvider('7tv', this.sevenTVProvider);

        console.log('[Chat] All providers initialized and registered with cache manager');
    }

    async joinChannel(channel, messageCallback) {
        console.log(`[Chat] Joining channel: ${channel}`);

        if (this.clients.has(channel)) {
            console.log(`[Chat] Using existing client for channel: ${channel}`);
            return this.clients.get(channel);
        }

        const client = new tmi.Client({
            connection: config.twitch.connection,
            channels: [channel],
        });

        try {
            await client.connect();
            console.log(`[Chat] Connected to channel: ${channel}`);
            this.clients.set(channel, client);

            // Set up message handler
            client.on("message", async (channel, tags, message, self) => {
                const channelId = tags["room-id"];

                if (!channelId) {
                    console.warn(`[Chat] No room-id for channel: ${channel}`);
                    return;
                }

                try {
                    // Get emotes from cache manager (will fetch if needed)
                    const twitchEmotes = this.twitchEmoteProvider.parseMessage(message, tags.emotes);
                    
                    // Get third-party emotes through cache manager
                    const thirdPartyEmotes = await this.emoteCacheManager.parseMessage(message, channelId);

                    // Combine emotes, giving priority to Twitch emotes
                    const allEmotes = this.mergeEmotes([
                        twitchEmotes,
                        ...this.groupEmotesByProvider(thirdPartyEmotes)
                    ]);

                    const messageData = {
                        user: tags["display-name"] || tags.username,
                        userId: tags["user-id"],
                        color: tags.color,
                        badges: this.badgeProvider.parseBadges(tags.badges),
                        content: message,
                        emotes: allEmotes,
                    };

                    messageCallback(messageData);
                } catch (error) {
                    console.error(`[Chat] Error processing message for channel ${channel}:`, error);
                }
            });

            // Set up additional event handlers
            client.on("connected", (address, port) => {
                console.log(`[Chat] Connected to ${address}:${port}`);
            });

            client.on("roomstate", async (channel, state) => {
                console.log(`[Chat] Room state for ${channel}:`, state);
                // Pre-fetch emotes when we get room state
                if (state["room-id"]) {
                    try {
                        console.log(`[Chat] Pre-fetching emotes for channel ID: ${state["room-id"]}`);
                        await this.emoteCacheManager.getChannelEmotes(state["room-id"]);
                    } catch (error) {
                        console.error(`[Chat] Error pre-fetching emotes:`, error);
                    }
                }
            });

            return client;
        } catch (error) {
            console.error(`[Chat] Error joining channel ${channel}:`, error);
            throw error;
        }
    }


    groupEmotesByProvider(emotes) {
        // Group emotes by provider to maintain the original priority order
        const grouped = new Map();
        
        for (const emote of emotes) {
            if (!grouped.has(emote.provider)) {
                grouped.set(emote.provider, []);
            }
            grouped.get(emote.provider).push(emote);
        }

        // Return arrays of emotes in the order we want to process them
        return ['bttv', 'ffz', '7tv'].map(provider => 
            grouped.get(provider) || []
        );
    }

    mergeEmotes(emoteLists) {
        const emotePositions = new Map();

        // Process emote lists in order of priority
        for (const emotes of emoteLists) {
            for (const emote of emotes) {
                const key = `${emote.start}-${emote.end}`;
                if (!emotePositions.has(key)) {
                    emotePositions.set(key, emote);
                }
            }
        }

        return Array.from(emotePositions.values())
            .sort((a, b) => a.start - b.start);
    }

    leaveChannel(channel) {
        const client = this.clients.get(channel);
        if (client) {
            client.disconnect();
            this.clients.delete(channel);
        }
    }

    // Helper method to get cache statistics
    getCacheStats() {
        return this.emoteCacheManager.getCacheStats();
    }

    // Helper method to manually invalidate cache for a channel
    invalidateEmoteCache(channelId) {
        this.emoteCacheManager.invalidateCache(channelId);
    }
}
