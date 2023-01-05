const sharp = require("sharp");
const fs = require("fs");
// const ffmpeg = require('ffmpeg');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const generateVideoMode = process.argv[2] === "video";
const loadSeedMode = process.argv[2] === "load";

const outFile = "out";

const generateImageCount = 4140;

const multiChannelSeeds = true; // Black and white: false, colors: true
const seedCount = 3; // Between 1 and 10 (greatly affects performance)
const seedMultiplier = 500; // Between 1 and width or 1 and height
const seedFrequencyMod = 0.02; // Between 0 and seedMultiplier / 100 for better results
const seedOffsetMod = 0.02; // Between 0 and 0.25 for better results
const seedFalloff = 10; // Between 0 and infinity for smaller changes from seeds after the first one

const width = 1000;
const height = 1000;

const finalVideoPath = `${outFile}/videoOut.mp4`;
// const frameRate = 30;
const frameRate = 1;

function getSeed() {
    return {
        frequency: Math.random() * seedMultiplier,
        frequencyMod: (Math.random() * seedFrequencyMod * 2) - seedFrequencyMod,
        offset: Math.random(),
        offsetMod: (Math.random() * seedOffsetMod * 2) - seedOffsetMod
    };
}

let xSeedR = [];
let xSeedG = [];
let xSeedB = [];

let ySeedR = [];
let ySeedG = [];
let ySeedB = [];

function generateSeeds() {
    xSeedR = [];
    xSeedG = [];
    xSeedB = [];
    ySeedR = [];
    ySeedG = [];
    ySeedB = [];
    for (let seedIndex = 0; seedIndex < seedCount; seedIndex++) {
        const xSeed = getSeed();
        xSeedR.push(xSeed);
        xSeedG.push(multiChannelSeeds ? getSeed() : xSeed);
        xSeedB.push(multiChannelSeeds ? getSeed() : xSeed);

        const ySeed = getSeed();
        ySeedR.push(ySeed);
        ySeedG.push(multiChannelSeeds ? getSeed() : ySeed);
        ySeedB.push(multiChannelSeeds ? getSeed() : ySeed);
    }
}

function modifySeeds() {
    const seeds = [xSeedR, xSeedG, xSeedB, ySeedR, ySeedG, ySeedB];
    for (let seedIndex = 0; seedIndex < seeds.length; seedIndex++) {
        for (let seedPartIndex = 0; seedPartIndex < seeds[seedIndex].length; seedPartIndex++) {
            const seed = seeds[seedIndex][seedPartIndex];
            seed.frequency += seed.frequencyMod;
            if (Math.abs(seed.frequency) >= seedMultiplier) {
                seed.frequencyMod = -seed.frequencyMod;
            }
            seed.offset += seed.offsetMod;
        }
    }
}

function evaluateValue(x, y) {
    let xValue = {r: 0, rL: 0, g: 0, gL: 0, b: 0, bL: 0};
    for (let xSeedIndex = 0; xSeedIndex < xSeedR.length; xSeedIndex++) {
        xValue.r += Math.sin((x / xSeedR[xSeedIndex].frequency) + xSeedR[xSeedIndex].offset) / ((xSeedIndex * seedFalloff) + 1);
        xValue.rL += 1 / ((xSeedIndex * seedFalloff) + 1);
    }
    if (multiChannelSeeds) {
        for (let xSeedIndex = 0; xSeedIndex < xSeedG.length; xSeedIndex++) {
            xValue.g += Math.sin((x / xSeedG[xSeedIndex].frequency) + xSeedG[xSeedIndex].offset) / ((xSeedIndex * seedFalloff) + 1);
            xValue.gL += 1 / ((xSeedIndex * seedFalloff) + 1);
        }
        for (let xSeedIndex = 0; xSeedIndex < xSeedB.length; xSeedIndex++) {
            xValue.b += Math.sin((x / xSeedB[xSeedIndex].frequency) + xSeedB[xSeedIndex].offset) / ((xSeedIndex * seedFalloff) + 1);
            xValue.bL += 1 / ((xSeedIndex * seedFalloff) + 1);
        }
    }
    xValue = {
        r: xValue.r / xValue.rL,
        g: multiChannelSeeds ? xValue.g / xValue.gL : 0,
        b: multiChannelSeeds ? xValue.b / xValue.bL : 0
    };

    let yValue = {r: 0, rL: 0, g: 0, gL: 0, b: 0, bL: 0};
    for (let ySeedIndex = 0; ySeedIndex < ySeedR.length; ySeedIndex++) {
        yValue.r += Math.sin((y / ySeedR[ySeedIndex].frequency) + ySeedR[ySeedIndex].offset) / ((ySeedIndex * seedFalloff) + 1);
        yValue.rL += 1 / ((ySeedIndex * seedFalloff) + 1);
    }
    if (multiChannelSeeds) {
        for (let ySeedIndex = 0; ySeedIndex < ySeedG.length; ySeedIndex++) {
            yValue.g += Math.sin((y / ySeedG[ySeedIndex].frequency) + ySeedG[ySeedIndex].offset) / ((ySeedIndex * seedFalloff) + 1);
            yValue.gL += 1 / ((ySeedIndex * seedFalloff) + 1);
        }
        for (let ySeedIndex = 0; ySeedIndex < ySeedB.length; ySeedIndex++) {
            yValue.b += Math.sin((y / ySeedB[ySeedIndex].frequency) + ySeedB[ySeedIndex].offset) / ((ySeedIndex * seedFalloff) + 1);
            yValue.bL += 1 / ((ySeedIndex * seedFalloff) + 1);
        }
    }
    yValue = {
        r: yValue.r / yValue.rL,
        g: multiChannelSeeds ? yValue.g / yValue.gL : 0,
        b: multiChannelSeeds ? yValue.b / yValue.bL : 0
    };

    return {
        r: (xValue.r + yValue.r),
        g: multiChannelSeeds ? (xValue.g + yValue.g) : (xValue.r + yValue.r),
        b: multiChannelSeeds ? (xValue.b + yValue.b) : (xValue.r + yValue.r)
    };
}

function addColor(pixels) {
    for (let y = 0; y < pixels.length; y++) {
        for (let x = 0; x < pixels[y].length; x++) {
            setColor(x, y, evaluateValue(x, y), pixels);
        }
    }
}

function setColor(x, y, value, pixels) {
    pixels[y][x] = {
        r: value.r * 255,
        g: value.g * 255,
        b: value.b * 255,
        a: 255
    }
}

function getPixelArray(pixels) {
    const pixelArray = [];
    for (let y = 0; y < pixels.length; y++) {
        for (let x = 0; x < pixels[y].length; x++) {
            pixelArray.push(pixels[y][x].r, pixels[y][x].g, pixels[y][x].b, pixels[y][x].a);
        }
    }
    return pixelArray;
}

async function generateVideo() {
    const images = [];

    const files = fs.readdirSync(outFile);

    files.sort((a, b) => {
        return parseInt(a) - parseInt(b);
    })

    for (let i in files) {
        if (files[i].endsWith(".png"))
            // images.push({path: `${outFile}/${files[i]}`, loop: secondsToShowEachImage});
            images.push(`${outFile}/${files[i]}`);
    }

    console.log(images);
    try {
        const ffmpegCommand = ffmpeg();
        for (let i in images) {
            ffmpegCommand.input(images[i])
                .inputOptions(`-framerate ${frameRate}`)
                .duration(images.length * frameRate * 100)
                .fps(frameRate);
        }
        ffmpegCommand
            .videoCodec('libx264')
            .outputOptions([
                '-pix_fmt yuv420p'
            ])
            .saveToFile(finalVideoPath);
    } catch (err) {
        console.log("ERR CAUGHT", err);
    }
}

(async () => {
    if (generateVideoMode) {
        await generateVideo();
    } else {
        if (!loadSeedMode) {
            generateSeeds();

            const seeds = {
                "xSeedR": xSeedR,
                "xSeedG": xSeedG,
                "xSeedB": xSeedB,
                "ySeedR": ySeedR,
                "ySeedG": ySeedG,
                "ySeedB": ySeedB
            }

            fs.writeFileSync(`${outFile}/seeds.json`, JSON.stringify(seeds));
        } else {
            const seeds = JSON.parse(fs.readFileSync(`${outFile}/seeds.json`).toString());

            console.log("loading seeds");
            console.log(seeds);

            xSeedR = seeds["xSeedR"];
            xSeedG = seeds["xSeedG"];
            xSeedB = seeds["xSeedB"];
            ySeedR = seeds["ySeedR"];
            ySeedG = seeds["ySeedG"];
            ySeedB = seeds["ySeedB"];
        }

        for (let imageIndex = 0; imageIndex < generateImageCount; imageIndex++) {
            console.log(`Generating image ${imageIndex} / ${generateImageCount}`);

            const pixels = Array(height);
            for (let y = 0; y < pixels.length; y++) {
                pixels[y] = Array(width);
                for (let x = 0; x < pixels[y].length; x++) {
                    pixels[y][x] = {
                        r: 255,
                        g: 255,
                        b: 255,
                        a: 255
                    };
                }
            }

            addColor(pixels);

            const pixelArray = getPixelArray(pixels);

            const sharpImage = sharp(new Buffer.from(pixelArray), {
                raw: {
                    width: width,
                    height: height,
                    channels: 4
                }
            });
            await sharpImage.toFile(`${outFile}/${imageIndex}.png`);

            modifySeeds();
        }
    }
})();
