import { Scenes, session, Telegraf } from "telegraf";
import { BotContext } from "./context"
import { bot as config } from "./configs"

let token = "8435820481:AAGmMjlqjlW074T8zKxMKHLAiuWh_pMfxWI";

export const bot = new Telegraf<BotContext>(token)
// export const bot = new Telegraf<BotContext>(token, {
//     telegram: { apiRoot: "https://public-telegram-bypass.solyfarzane9040.workers.dev" }
// });

bot.start((ctx)=> {
        console.log("starting bot");
        ctx.reply("ll");
    }
);

// bot.command("help",(ctx) => {
//     console.log(ctx);
// })



bot.launch()
    // .then(() => {console.log("launch")})
    // .finally(() => { console.log("lololololo") })
    // .catch(console.error);
