import { Cat } from "./cat.js";
import { POSE_KNOCKDOWN, POSE_STAND, POSE_WALK_2 } from "./kinematics.js";
import { Player } from "./player.js";
import { Rat } from "./rat.js";
import { RatKing } from "./ratking.js";

const add = (g, o) => g.addGameObject(o);

const setNextCutCb = (g) => {
    g.cutsceneCallback = (g) => {
        g.nextCutscene();
    };
};
const textCutScene = (g, t, a = 'center') => {
    g.texts = [
        {   text: t, align: a }
    ];
    g.nextText();
    setNextCutCb(g);
};

const setSceneWonCallback = (g, n) => {
    g.sceneWonCallback = (g) => {
        let rats = g.getGameObjects(["rat"]);
        if(rats.length === 0) {
            g.initObjects(n);
        }
    };
};

export const SCENES = [];
SCENES[0] = (game) => {
    setBackground('day');
    game.gameObjects = [];
    let cat = add(game, new Cat(-200, 900));
    let ratking = add(game, new RatKing(2100, 800));
    ratking.walkSpeed = 200;
    let rat1 = add(game, new Rat(2200, 700));
    rat1.walkSpeed = 300;
    let rat2 = add(game, new Rat(2200, 1000));
    rat2.walkSpeed = 300;
    
    game.cutscene = [

        (game) => {
            textCutScene(game, "Welcome to Miami Mice!<br><br>Keyboard: WASD to move, H to punch, J to kick, B to block<br>Gamepad: Left stick to move, B to punch, A to kick, X to block<br><br>Press punch/kick to start","center");
        },
        (game) => {
            textCutScene(game, "Miami Beach, 1992.<br>The notorious Rat King has taken over the city and is terrorizing its citizens.<br>Only one hero can stop him...<br>Special Agent KUNG FURBALL!");
            cat.walkSpeed = 300;
            cat.kiTarget = {x:400, y:900};
        },
        (game) => {
            
            ratking.kiTarget = {x:1400, y:880};
            ratking.kiTargetReached = () => {
                ratking.kiTargetReached = null;
                game.nextCutscene();
            };
            rat1.kiTarget = {x:1700, y:700};
            rat2.kiTarget = {x:1700, y:1050};
        },
        (game) => {
            textCutScene(game, "Special Agent <b>KUNG FURBALL</b>:<br>I've tracked you down, Rat King!<br>Your reign of terror ends here!<br>You're under arrest!","left");
        },
        (game) => {
            textCutScene(game, "<b>RAT KING</b>: <br>Agent Furball! Finally, we meet in person.<br>So, the Feline Bureau of Investigation has come to play!<br><br>This is my city!<br>Stay out of my way!", "right");
        },
        (game) => {
            textCutScene(game, "Special Agent <b>KUNG FURBALL</b>:<br>You may have the police in your pocket.<br> But I am the law!<br>The Feline Bureau of Investigation will bring you to justice!", "left");
        },
        (game) => {
            game.nextText();
            ratking.queueMorph(POSE_WALK_2, 0.2, true);
            ratking.kiTarget = {x:2300, y:900};
            ratking.kiTargetReached = () => {
                ratking.kiTargetReached = null;
                game.initObjects(1); // Start main game
            };
            rat1.kiTarget = {x:2400, y:700};
            rat2.kiTarget = {x:2400, y:1200};
            game.keepObjects = [new Player(cat.x, cat.y, 1)];
        }
    ];
    game.nextCutscene();
};

SCENES[1] = (game) => {
    game.gameObjects = [];
    game.keepObjects.forEach(o => add(game, o));
    game.keepObjects = [];
    let rat = add(game, new Rat(1800, 900));
    setSceneWonCallback(game, 2);
};

SCENES[2] = (game) => {
    game.gameObjects = [];
    let player = add(game, new Player(900, 900, 1));
    add(game, new Rat(1800, 800));
    add(game, new Rat(1900, 1000));
    add(game, new Rat(100, 800));
    add(game, new Rat(200, 1000));
    setSceneWonCallback(game, 3);
};

SCENES[3] = (game) => {
    setBackground('dusk');
    game.gameObjects = [];
    add(game, new Cat(400, 900));
    let ratking = add(game, new RatKing(2100, 1050));
    ratking.walkSpeed = 200;
    let throwerRat = add(game, new Rat(2200, 900));
    throwerRat.walkSpeed = 300;
    
    game.cutscene = [
        (game) => {
            ratking.kiTarget = {x:1400, y:1050};
            ratking.kiTargetReached = () => {
                ratking.kiTargetReached = null;
                game.nextCutscene();
            };
        },
        (game) => {
            textCutScene(game, "<b>RAT KING</b>: <br>I see, Master Splinter the traitor trained you well.<br>Hah! But you are no match for me, kitty!", "right");
        },
        (game) => {
            textCutScene(game, "<b>RAT KING</b>:<br>May I introduce you to my best cheese thrower?<br>Il grande Alonzo Padano! <br>Prepare to meet your cheesy doom, Furball!", "right");
            throwerRat.kiTarget = {x:1550, y:900};
        },
        (game) => {
            game.nextText();
            ratking.queueMorph(POSE_WALK_2, 0.2, true);
            ratking.kiTarget = {x:2300, y:1050};
            ratking.kiTargetReached = () => {
                ratking.kiTargetReached = null;
                game.initObjects(4); 
            };
            throwerRat.isThrower = true;
            throwerRat.walkSpeed = 100;
            game.keepObjects = [throwerRat];
        }
    ];
    game.nextCutscene();
};

SCENES[4] = (game) => {
    game.gameObjects = [];
    add(game, new Player(400, 900, 1));
    add(game, new Rat(2100, 750));
    add(game, new Rat(2300, 1000));
    game.keepObjects.forEach(o =>  {
        o.kiTarget = null;
        add(game, o);
    });
    game.keepObjects = [];
    setSceneWonCallback(game, 5);
};

SCENES[5] = (game) => {
    game.gameObjects = [];
    add(game, new Player(400, 900, 1));
    add(game, new Rat(1800, 800)).isThrower = true;
    add(game, new Rat(1900, 1000));
    add(game, new Rat(100, 800));
    add(game, new Rat(200, 1000)).isThrower = true;
    setSceneWonCallback(game, 6);
};

SCENES[6] = (game) => {
    setBackground('night');
    game.gameObjects = [];
    add(game, new Cat(700, 900));
    let ratking = add(game, new RatKing(2100, 1050));
    ratking.walkSpeed = 200;
    
    game.cutscene = [
        (game) => {
            ratking.kiTarget = {x:1400, y:1050};
            ratking.kiTargetReached = () => {
                ratking.kiTargetReached = null;
                game.nextCutscene();
            };
        },
        (game) => {
            textCutScene(game, "<b>RAT KING</b>: <br>What a shame! I am running out of kilobytes!<br>Ok, I will have to take matters into my own hands!<br>Showdown time!", "right");
        },
        (game) => {
            setTimeout(() => game.initObjects(7), 200);
        }
    ];
    game.nextCutscene();
};

SCENES[7] = (game) => {
    game.gameObjects = [];
    add(game, new Player(700, 900, 1));
    add(game, new RatKing(1450, 1050)).hp = 200;
    
    add(game, new Rat(1800, 800)).isThrower = true;
    add(game, new Rat(1900, 1000));
    add(game, new Rat(100, 800));
    add(game, new Rat(200, 1000)).isThrower = true;
    
    setSceneWonCallback(game, 8);
};



SCENES[8] = (game) => {
    game.gameObjects = [];
    add(game, new Player(700, 900, 1));
    game.cutscene = [
        (game) => {
            textCutScene(game, "<b>KUNG FURBALL</b>: <br>Finally, justice is served!", "left");
        },
        (game) => {
            game.texts = [
                { text: "Thank you for playing Miami Mice!<br>I hope you enjoyed the (short) game.<br><br>Made by: DerBenniBanni<br><br>Special thanks to Alkor and Randy Tayler for<br>excellent naming suggestions<br>and to Rob Louie for the knockdown gameplay hints.<br><br>Press action to restart.", align: "center" }
            ];
            game.nextText();
            q('.mainmenu').style.display = null;
            q('.miamimice').style.fontSize = null;
            q('.miamimice').style.opacity = null;
            q('.miamimice').style.top = '5vh';
            q('.miamimice').style.zIndex = null;
            q('.neno')
            game.cutsceneCallback = (g) => {
                g.gameObjects = [];
                g.playerStats = [
                    {hp: 100, maxHp: 100, score: 0, stamina:100} // Player 1
                ];
                q('.intro').style.opacity = '1';
                document.querySelectorAll('.mainmenu,.neon,.cast').forEach(div=>div.style.opacity = null);
                q('.mainmenu').style.display = null;
                q('.miamimice').style.fontSize = null;
                q('.miamimice').style.opacity = null;
                q('.miamimice').style.top = null;
                q('.miamimice').style.zIndex = null;
                g.nextText();
                setBackground('day');
            };
        }
    ];
    game.nextCutscene();
};

SCENES[9] = (game) => {
    let rand = Math.random();
    if(rand < 0.33) setBackground('day');
    else if(rand < 0.66) setBackground('dusk');
    else setBackground('night');
    game.gameObjects = [];
    if(!game.hordePlayer) {
        game.hordePlayer = new Player(950, 900, 1);
    }
    add(game, game.hordePlayer);

    for(let i=0; i<game.hordeStage; i++) {
        let dx = Math.random() < 0.5 ? -1 : 1;
        let x = 960 + dx * (960 + i*200 +Math.random()*80);
        let y = Math.random() * 350 + 700;
        let rat = add(game, new Rat(x, y));
        if(Math.random() < 0.5) rat.isThrower = true;
    }
    game.sceneWonCallback = (g) => {
        let rats = g.getGameObjects(["rat"]);
        if(rats.length === 0) {
            game.hordeStage++;
            g.initObjects(9);
        }
    };
}