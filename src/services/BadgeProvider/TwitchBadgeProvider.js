import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TwitchBadgeProvider {
  constructor() {
    this.badges = null;
  }

  async initialize() {
    try {
      const badgesData = await fs.readFile(
        path.join(__dirname, "../../../public/twitch-badges.json"),
        "utf8"
      );
      this.badges = JSON.parse(badgesData);
      console.log("Successfully loaded badges data");
    } catch (error) {
      console.error("Error loading badges data:", error);
      this.badges = {};
    }
  }

  getBadgeInfo(badgeId, version = "1") {
    if (!this.badges || !this.badges[badgeId]) {
      return null;
    }

    const badgeSet = this.badges[badgeId];
    const badge = badgeSet.find((b) => b.id === version) || badgeSet[0];

    if (!badge) return null;

    return {
      id: badgeId,
      version: badge.id,
      title: badge.title,
      image: badge.image,
    };
  }

  parseBadges(badges) {
    if (!badges) return [];

    return Object.entries(badges)
      .map(([id, version]) => this.getBadgeInfo(id, version))
      .filter((badge) => badge !== null);
  }
}
