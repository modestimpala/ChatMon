// EmoteCacheManager.js
export class EmoteCacheManager {
    constructor(options = {}) {
        this.channelCache = new Map();
        // Default cache duration of 1 hour
        this.cacheDuration = options.cacheDuration || 60 * 60 * 1000;
        this.providers = new Map();
        console.log("[Cache] Initialized with duration:", this.cacheDuration);
    }

    registerProvider(name, provider) {
        this.providers.set(name, provider);
        console.log("[Cache] Registered provider:", name);
    }

    async getChannelEmotes(channelId) {
        const cacheKey = channelId;
        const now = Date.now();
        
        // Check if we have cached data for this channel
        if (this.channelCache.has(cacheKey)) {
            const cacheEntry = this.channelCache.get(cacheKey);
            
            // If cache hasn't expired, return the cached data
            if (now - cacheEntry.timestamp < this.cacheDuration) {
                return cacheEntry.data;
            } else {
                console.log("[Cache] Cache expired for channel:", channelId);
                this.channelCache.delete(cacheKey);
            }
        }

        console.log("[Cache] Fetching fresh emotes for channel:", channelId);
        
        // Fetch emotes from all providers concurrently
        const providerPromises = Array.from(this.providers.entries()).map(async ([name, provider]) => {
            try {
                const emotes = await provider.getEmotes(channelId);
                return { name, emotes };
            } catch (error) {
                console.error(`[Cache] Error fetching emotes from ${name}:`, error);
                return { name, emotes: new Map() };
            }
        });

        const results = await Promise.all(providerPromises);
        
        // Store results in cache
        const cacheEntry = {
            timestamp: now,
            data: Object.fromEntries(results.map(({ name, emotes }) => [name, emotes]))
        };
        
        this.channelCache.set(cacheKey, cacheEntry);
        console.log("[Cache] Cached new emotes for channel:", channelId);
        
        return cacheEntry.data;
    }

    invalidateCache(channelId) {
        if (channelId) {
            console.log("[Cache] Invalidating cache for channel:", channelId);
            this.channelCache.delete(channelId);
        } else {
            console.log("[Cache] Invalidating entire cache");
            this.channelCache.clear();
        }
    }

    async parseMessage(message, channelId) {
        // Ensure we have cached emotes
        const cachedEmotes = await this.getChannelEmotes(channelId);
        
        // Parse message using each provider
        const results = Array.from(this.providers.entries()).map(([name, provider]) => {
            return provider.parseMessage(message, channelId);
        });
        
        // Combine all emotes found
        return results.flat();
    }

    getCacheStats() {
        return {
            totalChannels: this.channelCache.size,
            channels: Array.from(this.channelCache.entries()).map(([channelId, entry]) => ({
                channelId,
                age: Date.now() - entry.timestamp,
                providerCounts: Object.fromEntries(
                    Object.entries(entry.data).map(([provider, emotes]) => 
                        [provider, emotes.size]
                    )
                )
            }))
        };
    }
}