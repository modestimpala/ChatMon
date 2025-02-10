import tmi from "tmi.js";
import { TwitchProvider } from "./EmoteProvider/TwitchProvider.js";
import { BTTVProvider } from "./EmoteProvider/BTTVProvider.js";
import { FFZProvider } from "./EmoteProvider/FFZProvider.js";
import { SevenTVProvider } from "./EmoteProvider/SevenTVProvider.js";
import { TwitchBadgeProvider } from "./BadgeProvider/TwitchBadgeProvider.js";
import { config } from "../config/default.js";

export class TwitchChatManager {
    constructor() {
        this.clients = new Map();
        this.emoteProvider = new TwitchProvider();
        this.badgeProvider = new TwitchBadgeProvider();
        this.bttvProvider = new BTTVProvider();
        this.ffzProvider = new FFZProvider();
        this.sevenTVProvider = new SevenTVProvider();

        this.initialize();
    }

    async initialize() {
        await this.badgeProvider.initialize();
        await this.bttvProvider.initialize();
        await this.emoteProvider.initialize();
        await this.ffzProvider.initialize();
        await this.sevenTVProvider.initialize();
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
                    // Ensure we have BTTV emotes for this channel
                    await this.bttvProvider.getEmotes(channelId);
                    await this.ffzProvider.getEmotes(channelId);
                    await this.sevenTVProvider.getEmotes(channelId);

                    // Parse emotes from all providers
                    const twitchEmotes = this.emoteProvider.parseMessage(message, tags.emotes);
                    const bttvEmotes = this.bttvProvider.parseMessage(message, channelId);
                    const ffzEmotes = this.ffzProvider.parseMessage(message, channelId);
                    const sevenTVEmotes = this.sevenTVProvider.parseMessage(message, channelId);


                    // Combine emotes, giving priority to Twitch emotes
                    const allEmotes = this.mergeEmotes([
                        twitchEmotes,
                        bttvEmotes,
                        ffzEmotes,
                        sevenTVEmotes,
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
            client.on("connected", async (address, port) => {
                console.log(`[Chat] Connected to ${address}:${port}`);
            });

            client.on("roomstate", async (channel, state) => {
                console.log(`[Chat] Room state for ${channel}:`, state);
                // If we get room-id from roomstate, we can pre-fetch BTTV emotes
                if (state["room-id"]) {
                    try {
                        console.log(`[Chat] Pre-fetching BTTV emotes for channel ID: ${state["room-id"]}`);
                        await this.bttvProvider.getEmotes(state["room-id"]);
                    } catch (error) {
                        console.error(`[Chat] Error pre-fetching BTTV emotes:`, error);
                    }
                }
            });

            return client;
        } catch (error) {
            console.error(`[Chat] Error joining channel ${channel}:`, error);
            throw error;
        }
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
}
