const prohibited = new Set([
    "puta", "puto", "mierda", "pendejo", "pendeja", "cabron", "cabrona",
    "fuck", "fucker", "shit", "bitch", "asshole",
    "cazzo", "merda", "stronzo", "stronza", "vaffanculo",
    "nigger", "niggers", "nigga", "niggas", "chink", "chinks", "spic", "spics",
    "wetback", "wetbacks", "gook", "gooks", "kike", "kikes", "paki", "pakis",
    "negrata", "negratas", "sudaca", "sudacas", "terrone", "terroni",
    "raghead", "ragheads", "towelhead", "towelheads",
    "faggot", "faggots", "dyke", "dykes", "tranny", "trannies",
    "maricon", "maricones", "marica", "maricas", "frocio", "froci",
    "retard", "retards", "retarded", "mongolo", "mongola", "mongolico", "mongolica",
    "subnormal", "subnormales",
    "nazi", "nazis", "nazista", "nazisti", "neonazi", "neonazis", "neonazista",
    "nazismo", "nazism", "hitler", "kkk", "heilhitler", "siegheil", "whitepower",
    "daesh", "alqaeda", "alqaida", "supremacist", "supremacists", "supremacista", "supremacistas",
    "kill", "killer", "killers", "lynch", "murder", "murderer", "massacre", "massacra",
    "matar", "asesinar", "asesinato", "asesino", "asesina", "matanzas",
    "omicidio", "uccidere", "assassino", "assassina",
    "rape", "rapist", "rapists", "violador", "violadora", "violadores",
    "stupro", "stupratore", "stupratori",
    "porn", "porno", "pornography", "pornografia", "pornografico", "pornografica"
]);

const prohibitedPhrases = [
    "white power", "sieg heil", "heil hitler", "ku klux klan",
    "al qaeda", "al qaida", "islamic state", "estado islamico", "stato islamico",
    "kill all jews", "kill all muslims", "muerte a judios", "muerte a musulmanes",
    "matar judios", "matar musulmanes", "morte agli ebrei", "morte ai musulmani"
];

function isOffensive(username) {
    const words = username.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const substitutions = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t" };
    const folded = words.map(word => word.replace(/[013457]/g, digit => substitutions[digit]));
    for (const tokens of [words, folded]) {
        if (tokens.some(word => prohibited.has(word) || prohibited.has(word.replace(/\d+$/, "")))) return true;
        const text = ` ${tokens.join(" ")} `;
        if (prohibitedPhrases.some(phrase => text.includes(` ${phrase} `))) return true;
        let letters = "";
        for (const word of [...tokens, ""]) {
            if (word.length === 1) letters += word;
            else {
                if (prohibited.has(letters)) return true;
                letters = "";
            }
        }
    }
    return false;
}

module.exports = { isOffensive };
