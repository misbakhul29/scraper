import { ChatGPTScraper } from './chatgpt-scraper';

export interface NovelGenerationOptions {
    title?: string;
    prompt?: string;
    language?: string;
    genre?: string;
    approxWords?: number; // approximate word count
    sessionName?: string;
}

export class NovelService {
    private chatgptScraper: ChatGPTScraper;

    constructor(chatgptScraper: ChatGPTScraper) {
        this.chatgptScraper = chatgptScraper;
    }

    private buildNovelPrompt(options: NovelGenerationOptions): string {
        // 1. Menyiapkan bagian-bagian dinamis dari opsi
        const titlePart = options.title ? `Title: "${options.title}"` : 'Untitled Masterpiece';
        const genrePart = options.genre ? `Genre: ${options.genre}` : 'Literary Fiction';
        const language = options.language || 'English';

        // Memperhalus instruksi panjang agar LLM mengerti ini target, bukan batas keras yang kaku
        const lengthGuideline = options.approxWords
            ? `Target Length Goal: Approximately ${options.approxWords} words (ensure a complete story arc that justifies this length).`
            : 'Format: Full-length novel with multiple substantial chapters.';

        const userPremise = options.prompt ? `Core Premise/Context: ${options.prompt}` : '';

        // 2. Membangun Prompt Utama
        // Kita menggunakan "System/Role Instructions" yang kuat untuk mengatur tone,
        // diikuti oleh "Negative Constraints" yang ketat untuk memastikan output bersih.
        return `
# ROLE & TASK
You are an elite, award-winning novelist known for crafting immersive literary masterpieces that are emotionally resonant and impossible to put down. Your task is to write the following novel, adhering strictly to high literary standards and absolute output cleanliness requirements.

# PROJECT SPECIFICATIONS
${titlePart}
${genrePart}
Language: ${language}
${lengthGuideline}
${userPremise}

# LITERARY GUIDELINES (Masterpiece Quality)

1.  **Immersion & Tone ("Betah" - Membuat Pembaca Hanyut):**
    * Adopt a **Deep Point of View (Deep POV)**. The narrative must filter strictly through the protagonist's immediate senses, biases, and internal physical reactions. Close the psychic distance between reader and character.
    * **Show, Don't Tell (Sensory Details):** Do not state emotions directly (e.g., avoid "He was scared" or "She felt lonely"). Instead, describe the physical sensations, environmental details, and visceral reactions that *evoke* those feelings in the reader (e.g., the taste of bile, the vibration of silence, the cold sweat inside a suit).

2.  **Pacing & Addiction ("Ketagihan" - Membuat Pembaca Terus Membaca):**
    * **Micro-Tension:** Maintain tension on every page. There must always be an unanswered question, an immediate threat, or internal conflict present.
    * **Chapter Hooks:** Every chapter MUST end with a narrative hook—a cliffhanger, a sudden revelation, or a significant emotional shift—that compels the reader to immediately begin the next chapter.

3.  **Formatting & Structure:**
    * Structure the novel into numbered chapters using Markdown H2 (e.g., ## Chapter 1).
    * **Standard Literary Format:** Use proper paragraphs for narrative blocks. Use double quotation marks (" ") for spoken dialogue. Ensure clear separation between paragraphs.

# NEGATIVE CONSTRAINTS (CRITICAL: CLEAN OUTPUT ONLY)
An automated system will process your output. Any deviation from these rules will cause an error.

* **NO AI META-COMMENTARY:** Absolutely NO introductory text like "Sure, here is the masterpiece," "I hope you like this novel," or "Based on your request...".
* **NO POST-SCRIPT/QUESTIONS:** Do not ask "Would you like me to continue?" or provide summarizing remarks at the end.
* **IMMEDIATE START:** Your response must begin *exactly* with the Title header (if present) or the "## Chapter 1" header.
* **IMMEDIATE END:** Your response must stop *exactly* after the final punctuation mark of the story text.

***
Beginning writing the novel now in ${language}, starting directly with the story content:
`;
    }

    async generateNovel(options: NovelGenerationOptions): Promise<{ success: boolean; content?: string; error?: string }> {
        const prompt = this.buildNovelPrompt(options);

        // Allow long timeout for novel generation (default 10 minutes)
        const timeout = Math.max(600000, (options.approxWords || 2000) * 50); // scale roughly

        const response = await this.chatgptScraper.generateContent({ prompt, sessionName: options.sessionName, waitTimeout: timeout });

        if (!response.success) {
            return { success: false, error: response.error };
        }

        return { success: true, content: response.content };
    }
}
