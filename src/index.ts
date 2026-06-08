#!/usr/bin/env bun
import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerBrowseCommands } from "./commands/browse.js";
import { registerSearchCommands } from "./commands/search.js";
import { registerPostCommands } from "./commands/post.js";
import { registerSocialCommands } from "./commands/social.js";
import { registerExportCommands } from "./commands/export.js";
import { registerMarketCommands } from "./commands/market.js";
import { registerPublishCommands } from "./commands/publish.js";
import { registerAnalyticsCommands } from "./commands/analytics.js";
import { registerScheduleCommands } from "./commands/schedule.js";
import { registerBulkCommands } from "./commands/bulk.js";
import { registerAccountCommands } from "./commands/accounts.js";

const program = new Command();

program
  .name("tkt")
  .description("TikTok in your terminal 🎵 — browse feeds, search, interact")
  .version("0.3.0")
  .addHelpText("after", `
Examples:
  tkt trending                     # Browse trending videos
  tkt trending --region IN -n 30   # 30 trending videos in India
  tkt hashtag fyp                  # Videos for #fyp
  tkt user charlidamelio           # User profile + videos
  tkt search "cooking tips"        # Search videos
  tkt show 3                       # Show details for result #3
  tkt open 3                       # Open result #3 in browser
  tkt like 3                       # Like result #3 (requires login)
  tkt feed                         # Your For You feed (requires login)
  tkt feed --following             # Your following feed
  tkt market "fitness supplements" # Market intelligence
  tkt export trending -o data.json # Export trending to JSON
  tkt login                        # Authenticate via browser cookies
  tkt status                       # Check auth status
  tkt comment 3 "Great video!"     # Comment on result #3
  tkt follow charlidamelio         # Follow a user
  tkt analytics                    # Your account analytics dashboard
  tkt competitor charlidamelio     # Competitor analysis
  tkt accounts                     # List saved accounts
`);

registerAuthCommands(program);
registerBrowseCommands(program);
registerSearchCommands(program);
registerPostCommands(program);
registerSocialCommands(program);
registerExportCommands(program);
registerMarketCommands(program);
registerPublishCommands(program);
registerAnalyticsCommands(program);
registerScheduleCommands(program);
registerBulkCommands(program);
registerAccountCommands(program);

program.parse(process.argv);
