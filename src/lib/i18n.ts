// i18n loader. The old app parsed ./json/en-us.json into a global `langJson`
// at startup and read langJson.langValues.* / langJson.errors.* everywhere.
// This module keeps that single-load model behind a typed accessor.
import { ReadFile } from "./bridge";

export interface LangJson {
    infoStep: string;
    info: { title: string; desc: string }[];
    quizStep: string;
    quiz: { title: string; question: string; choices: string[]; correctChoice: number; afterQuizInfo: string }[];
    quizWrongAnswer: string;
    quizNoChoice: string;
    langValues: Record<string, string>;
    errors: Record<string, string>;
}

export let langJson: LangJson;

export async function loadLangJson(): Promise<LangJson | null> {
    const langJsonString = await ReadFile("./json/en-us.json");
    if (langJsonString == null) {
        return null;
    }

    const parsed = JSON.parse(langJsonString);
    if (parsed == null) {
        return null;
    }
    langJson = parsed;
    return langJson;
}
