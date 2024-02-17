const sharp = require("sharp");
const fs = require("fs");
const {exec} = require("child_process");

if (process.argv[2] === undefined) throw SyntaxError("Action specification required (new/load/video/rename)");

const newSeedMode = process.argv[2] === "new";
const loadSeedMode = process.argv[2] === "load";
const generateVideoMode = process.argv[2] === "video";
const renameFilesMode = process.argv[2] === "rename";

const startIndex = process.argv[3] ?? 0;

const outFile = "out";

const generateImageCount = 200;
// const generateImageCount = 5940;

const maxFrequency = 0.5;

// Black and white: false, colors: true
const multiChannelSeeds = false;
// Between 1 and 10 (greatly affects performance)
const seedCount = 2;
// Between 1 and width or 1 and height
const seedFrequencyMultiplier = maxFrequency / 2;
// How much the frequency can change between each image
// Between 0 and seedFrequencyMultiplier / 100 for better results
const seedFrequencyMod = seedFrequencyMultiplier / 100;
// How close the frequencyMod needs to be to the target to trigger a switch
const seedFrequencyModTransitionRange = maxFrequency / 500;
// ??? God know what this means and what it does exactly
const seedFrequencyModTransitionFrequencyWeight = 20;
// ????? Excellent naming scheme right here
const seedFrequencyModTransitionTargetWeight = 1;
// How much the offset can change between each image
// Between 0 and 0.25 for better results
const seedOffsetMod = 0.01;
// Between 0 and infinity for smaller changes from seeds after the first one
const subSeedFalloff = 0;
// Between 0 and infinity for smaller changes from seeds after the first one
const subSeedFrequencyMultiplier = 1;

const width = 2000;
const height = 50;

const finalVideoPath = `${outFile}/videOut.mp4`;
const frameRate = 30;

// const frameRate = 50;

// The colors used to convert black and white pixels to something with color
const colorSteps = [
    {
        r: 1,
        g: 0,
        b: 0
    },
    {
        r: 1,
        g: 1,
        b: 0
    },
    {
        r: 0,
        g: 1,
        b: 0
    },
    {
        r: 0,
        g: 1,
        b: 1
    },
    {
        r: 0,
        g: 0,
        b: 1
    },
    {
        r: 1,
        g: 0,
        b: 1
    },
    {
        r: 1,
        g: 0,
        b: 0
    },
    {
        r: 1,
        g: 1,
        b: 0
    },
    {
        r: 0,
        g: 1,
        b: 0
    },
    {
        r: 0,
        g: 1,
        b: 1
    },
    {
        r: 0,
        g: 0,
        b: 1
    },
    {
        r: 1,
        g: 0,
        b: 1
    },
    {
        r: 1,
        g: 0,
        b: 0
    },
];

function getSeed() {
    return {
        frequency: Math.random() * seedFrequencyMultiplier,
        frequencyMod: 0,
        frequencyModTarget: (Math.random() * (seedFrequencyMod * 2)) - seedFrequencyMod,
        offset: Math.random(),
        offsetMod: (Math.random() * (seedOffsetMod * 2)) - seedOffsetMod,
    };
}

function setNewFrequencyModTarget(seed) {
    // seed.frequencyModTarget = (Math.random() * (seedFrequencyMod * 2)) - seedFrequencyMod;
    seed.frequencyModTarget = -seed.frequencyModTarget;
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
    // const seeds = [xSeedR, xSeedG, xSeedB, ySeedR, ySeedG, ySeedB];
    const seeds = [xSeedR, ySeedR];
    for (let seedIndex = 0; seedIndex < seeds.length; seedIndex++) {
        for (let seedPartIndex = 0; seedPartIndex < seeds[seedIndex].length; seedPartIndex++) {
            const seed = seeds[seedIndex][seedPartIndex];
            seed.frequency += seed.frequencyMod;

            if (Math.abs(seed.frequency) >= maxFrequency) {
                console.log("switch! (" + seedPartIndex + ")")
                setNewFrequencyModTarget(seed);
                seed.frequencyMod = -seed.frequencyMod;
            } else if (Math.abs(seed.frequencyMod - seed.frequencyModTarget) < seedFrequencyModTransitionRange) {
                // seed.frequencyModTarget = -seed.frequencyModTarget;
                setNewFrequencyModTarget(seed);
            }

            seed.frequencyMod = ((seed.frequencyMod * seedFrequencyModTransitionFrequencyWeight)
                    + (seed.frequencyModTarget * seedFrequencyModTransitionTargetWeight))
                / (seedFrequencyModTransitionFrequencyWeight + seedFrequencyModTransitionTargetWeight);
            // if (seedIndex === 0 && seedPartIndex === 0)
            //     console.log("(" + seedIndex + ", " + seedPartIndex + "): "
            //         + seed.frequencyMod + " -> " + seed.frequencyModTarget);

            seed.offset += seed.offsetMod;
        }
    }
}

function evaluateValue1(x, y) {
    let xValue = {r: 0, rL: 0, g: 0, gL: 0, b: 0, bL: 0};
    for (let xSeedIndex = 0; xSeedIndex < xSeedR.length; xSeedIndex++) {
        xValue.r += Math.sin((x / xSeedR[xSeedIndex].frequency) + xSeedR[xSeedIndex].offset) / ((xSeedIndex * subSeedFalloff) + 1);
        xValue.rL += 1 / ((xSeedIndex * subSeedFalloff) + 1);
    }
    if (multiChannelSeeds) {
        for (let xSeedIndex = 0; xSeedIndex < xSeedG.length; xSeedIndex++) {
            xValue.g += Math.sin((x / xSeedG[xSeedIndex].frequency) + xSeedG[xSeedIndex].offset) / ((xSeedIndex * subSeedFalloff) + 1);
            xValue.gL += 1 / ((xSeedIndex * subSeedFalloff) + 1);
        }
        for (let xSeedIndex = 0; xSeedIndex < xSeedB.length; xSeedIndex++) {
            xValue.b += Math.sin((x / xSeedB[xSeedIndex].frequency) + xSeedB[xSeedIndex].offset) / ((xSeedIndex * subSeedFalloff) + 1);
            xValue.bL += 1 / ((xSeedIndex * subSeedFalloff) + 1);
        }
    }
    xValue = {
        r: xValue.r / xValue.rL,
        g: multiChannelSeeds ? xValue.g / xValue.gL : 0,
        b: multiChannelSeeds ? xValue.b / xValue.bL : 0
    };

    let yValue = {r: 0, rL: 0, g: 0, gL: 0, b: 0, bL: 0};
    for (let ySeedIndex = 0; ySeedIndex < ySeedR.length; ySeedIndex++) {
        yValue.r += Math.sin((y / ySeedR[ySeedIndex].frequency) + ySeedR[ySeedIndex].offset) / ((ySeedIndex * subSeedFalloff) + 1);
        yValue.rL += 1 / ((ySeedIndex * subSeedFalloff) + 1);
    }
    if (multiChannelSeeds) {
        for (let ySeedIndex = 0; ySeedIndex < ySeedG.length; ySeedIndex++) {
            yValue.g += Math.sin((y / ySeedG[ySeedIndex].frequency) + ySeedG[ySeedIndex].offset) / ((ySeedIndex * subSeedFalloff) + 1);
            yValue.gL += 1 / ((ySeedIndex * subSeedFalloff) + 1);
        }
        for (let ySeedIndex = 0; ySeedIndex < ySeedB.length; ySeedIndex++) {
            yValue.b += Math.sin((y / ySeedB[ySeedIndex].frequency) + ySeedB[ySeedIndex].offset) / ((ySeedIndex * subSeedFalloff) + 1);
            yValue.bL += 1 / ((ySeedIndex * subSeedFalloff) + 1);
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

function getColorFraction(color, fraction) {
    return {
        r: color.r * fraction,
        g: color.g * fraction,
        b: color.b * fraction,
    };
}

// Value must be a number between 0 and 1
function blackAndWhiteToColor(value) {
    let value2 = value * (colorSteps.length - 1);
    let fromColor = colorSteps[Math.floor(value2)];
    let toColor = colorSteps[Math.ceil(value2)];

    let rem = value2;
    while (rem > 1) rem -= 1;

    if (fromColor === undefined || toColor === undefined) {
        console.log("fuck");
        return {
            r: 0,
            g: 0,
            b: 0,
        };
    }

    let c1 = getColorFraction(fromColor, 1 - rem);
    let c2 = getColorFraction(toColor, rem);

    return {
        r: c1.r + c2.r,
        g: c1.g + c2.g,
        b: c1.b + c2.b,
    };
}

function evaluateValue2(x, y) {
    let value = 0;
    let max = 0;
    for (let i = 0; i < 2; i++) {
        let falloff = ((i * subSeedFalloff) + 1);
        let frequencyMultiplier = subSeedFrequencyMultiplier * i + 1
        value += (Math.cos(
                ((xSeedR[i].frequency * frequencyMultiplier) * x) + xSeedR[i].offset
            ) / falloff)
            * (Math.sin(
                ((ySeedR[i].frequency * frequencyMultiplier) * y) + ySeedR[i].offset
            ) / falloff);
        max += 1 / falloff;
    }

    value /= max;

    return blackAndWhiteToColor((value + 1) / 2);
}

function addColor(pixels) {
    for (let y = 0; y < pixels.length; y++) {
        for (let x = 0; x < pixels[y].length; x++) {
            // setColor(x, y, evaluateValue1(x, y), pixels);
            setColor(x, y, evaluateValue2(x, y), pixels);
        }
    }
}

function setColor(x, y, value, pixels) {
    pixels[y][x] = {
        r: Math.round(value.r * 255),
        g: Math.round(value.g * 255),
        b: Math.round(value.b * 255),
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
    const files = fs.readdirSync(outFile);
    if (files.find((s) => s === finalVideoPath) !== undefined) fs.rmSync(finalVideoPath);

    let imageFormatSize = (files.length - 1).toString().length;
    await exec(`ffmpeg -framerate ${frameRate} -i "${outFile}/%${imageFormatSize}d.png" -c:v libx264 -pix_fmt yuv420p "${finalVideoPath}"`,
        (error, stdout, stderr) => {
            if (error) {
                console.log(`error: ${error.message}`);
                return;
            }
            if (stderr) {
                console.log(`stderr: ${stderr}`);
                return;
            }
            console.log(`stdout: ${stdout}`);
        });
}

(async () => {
    if (generateVideoMode) {
        await generateVideo();
    } else if (renameFilesMode) {
        const files = fs.readdirSync(outFile);
        const requiredLength = generateImageCount.toString().length;

        for (let i in files) {
            const splitFile = files[i].split(".");
            if (splitFile[0].length < requiredLength) {
                let newName = splitFile[0];
                while (newName.length < requiredLength) newName = "0" + newName;

                fs.renameSync(`${outFile}/${files[i]}`, `${outFile}/${newName}.${splitFile[1]}`);
            }
        }
    } else {
        const files = fs.readdirSync(outFile);
        for (let i in files) {
            const splitF = files[i].split(".");
            if (splitF[1] !== "json" && parseInt(splitF[0]) >= startIndex) fs.rmSync(`${outFile}/${files[i]}`);
        }

        if (newSeedMode) {
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
        } else if (loadSeedMode) {
            const seeds = JSON.parse(fs.readFileSync(`${outFile}/seeds.json`).toString());

            console.log("loading seeds from file");

            // xSeedR = seeds["xSeedR"];
            // xSeedG = seeds["xSeedG"];
            // xSeedB = seeds["xSeedB"];
            // ySeedR = seeds["ySeedR"];
            // ySeedG = seeds["ySeedG"];
            // ySeedB = seeds["ySeedB"];

            xSeedR = seeds["xSeedR"];
            xSeedG = seeds["xSeedR"];
            xSeedB = seeds["xSeedR"];
            ySeedR = seeds["xSeedR"];
            ySeedG = seeds["xSeedR"];
            ySeedB = seeds["xSeedR"];
        }

        const requiredOutputLength = generateImageCount.toString().length;
        for (let imageIndex = 0; imageIndex < generateImageCount; imageIndex++) {
            if (imageIndex < startIndex) {
                console.log(`Skipping image ${imageIndex} / ${generateImageCount}`);
            } else {
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

                let outFileName = imageIndex.toString();
                while (outFileName.length < requiredOutputLength) outFileName = "0" + outFileName;

                await sharpImage.toFile(`${outFile}/${outFileName}.png`);
            }

            modifySeeds();
        }
    }
})();
