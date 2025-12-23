import { PrismaClient } from '../generated/prisma/client';
import { ChatGPTScraper, ChatGPTResponse } from './chatgpt-scraper';
import { Page } from 'puppeteer';
import { ArticleExportService } from './article-export.service';

export interface ArticleGenerationOptions {
  topic: string;
  keywords?: string[];
  category?: string;
  author?: string;
  sessionName?: string;
}

export interface ArticleData {
  title: string;
  content: string;
  excerpt?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  tags?: string[];
  categories?: string[];
}

export class ArticleService {
  private prisma: PrismaClient;
  private chatgptScraper: ChatGPTScraper;
  private articleExportService: ArticleExportService;

  constructor(prisma: PrismaClient, chatgptScraper: ChatGPTScraper, exportDir?: string) {
    this.prisma = prisma;
    this.chatgptScraper = chatgptScraper;
    this.articleExportService = new ArticleExportService(exportDir);
  }

  /**
   * Generate slug from title
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Calculate reading time (assuming 200 words per minute)
   */
  private calculateReadingTime(content: string): number {
    const words = content.split(/\s+/).length;
    return Math.ceil(words / 200);
  }

  /**
   * Calculate word count
   */
  private calculateWordCount(content: string): number {
    return content.split(/\s+/).length;
  }

  /**
   * Generate article using ChatGPT
   */
  async generateArticle(options: ArticleGenerationOptions): Promise<any> {
    const { topic, keywords = [], category, author, sessionName } = options;

    // Build prompt for article generation
    const prompt = this.buildArticlePrompt(topic, keywords, category);

    console.log(`📝 Generating article for topic: ${topic}`);

    // Generate content using ChatGPT
    const response: ChatGPTResponse = await this.chatgptScraper.generateContent({
      prompt,
      sessionName,
      waitTimeout: 180000, // 3 minutes
    });

    if (!response.success || !response.content) {
      throw new Error(`Failed to generate article: ${response.error || 'Unknown error'}`);
    }

    // Parse and structure the article
    const articleData = this.parseArticleContent(response.content, topic, keywords, category);

    // Save to database
    const article = await this.saveArticle(articleData, author);

    return article;
  }

  /**
   * Build prompt for article generation
   */
  private buildArticlePrompt(topic: string, keywords: string[], category?: string): string {
  // Base instructions
  let prompt = `Act as a charismatic content creator and expert storyteller. Write a highly engaging, deep-dive article about "${topic}" that feels like a conversation with a smart friend.\n\n`;

  // Context injection
  if (category) {
    prompt += `Context/Category: ${category}\n`;
  }

  if (keywords.length > 0) {
    prompt += `Target Keywords (integrate naturally): ${keywords.join(', ')}\n`;
  }

  // The "Gen Z / Storyteller" Instructions
  prompt += `
\nDetailed Guidelines for Maximum Engagement:

1. TONE & VIBE (CRITICAL):
   - **Vibe:** High-energy, witty, and relatable ("Gen Z / Modern Internet Style"). Think "Twitter Thread expert" meets "Medium Top Writer".
   - **Language Style:** Use conversational hooks. It's okay to be a bit sassy or humorous where appropriate. STRICTLY AVOID dry, academic, or robotic corporate language.
   - **Connection:** Treat the reader like a close friend. Use "We," "You," and "Let's be honest."
   - **Storytelling:** Frame concepts as a narrative.

2. STRUCTURE & FLOW (STRICT):
   - **The "Bridge" Rule:** NEVER jump from an H2 directly to an H3. You MUST write a storytelling bridge paragraph (3-5 sentences) under every H2.
   - **Headings Format:** **NO EMOJIS IN HEADINGS**. Keep H1, H2, H3 clean and text-only.

3. VISUAL POP & SCANNABILITY (SMART PARAGRAPHING):
   - **Avoid Fragmentation:** Do NOT write in "LinkedIn Bro" style (one sentence per line). It creates a messy, disjointed look for long articles.
   - **The "2-4 Rule":** Group related sentences together. Standard paragraphs should be **2 to 4 sentences long** to maintain flow and substance.
   - **Strategic Brevity:** You may use a single-sentence paragraph ONLY for a massive punchline or transition, but do not overuse it.
   - **Markdown Magic:** Use **bold** for emphasis, but keep it within the paragraph block.
   - **Tables & Lists:** MUST include at least one Markdown Table and use lists where data allows to break up the reading rhythm.

4. SUBSTANCE & DEPTH:
   - **Word Count:** Minimum 1500 words.
   - **Go Deep:** Don't just scratch the surface. Give the "Secret Sauce".
   - **Real Talk:** Address common frustrations or myths.
   - **SEO:** Weave keywords in naturally.

IMPORTANT OUTPUT CONSTRAINTS:
1. Start directly with a Catchy Title (H1) - Text Only.
2. Start the Intro with a **Strong Hook**.
3. Do NOT include any meta-commentary.
4. End with a "Mic Drop" conclusion.
`;

  return prompt;
}

  /**
   * Parse article content and extract metadata
   */
  private parseArticleContent(
    content: string,
    topic: string,
    keywords: string[],
    category?: string
  ): ArticleData {
    // Extract title (first line or generate from topic)
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    let title = lines[0]?.trim() || `Complete Guide to ${topic}`;

    // Remove markdown formatting from title if present
    title = title.replace(/^#+\s*/, '').trim();

    // Remove markdown formatting helper
    const removeMarkdownFormatting = (text: string): string => {
      return text
        .replace(/^#+\s*/gm, '') // Remove heading markers
        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.*?)\*/g, '$1') // Remove italic
        .replace(/`(.*?)`/g, '$1') // Remove inline code
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove links, keep text
        .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '') // Remove images
        .replace(/^\s*[-*+]\s+/gm, '') // Remove list markers
        .replace(/^\s*\d+\.\s+/gm, '') // Remove numbered list markers
        .replace(/^>\s+/gm, '') // Remove blockquote markers
        .replace(/\n{2,}/g, ' ') // Replace multiple newlines with space
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim();
    };

    // Generate excerpt (first 150 characters, without markdown)
    const plainContent = removeMarkdownFormatting(content);
    const excerpt = plainContent.substring(0, 150).trim() + (plainContent.length > 150 ? '...' : '');

    // Generate meta title (max 60 characters, without markdown)
    const plainTitle = removeMarkdownFormatting(title);
    const metaTitle = plainTitle.length > 60 ? plainTitle.substring(0, 57) + '...' : plainTitle;

    // Generate meta description (max 160 characters, without markdown)
    const metaDescription = excerpt.length > 160 ? excerpt.substring(0, 157) + '...' : excerpt;

    // Combine keywords
    const allKeywords = [...keywords, topic, category].filter(Boolean) as string[];

    return {
      title,
      content,
      excerpt,
      metaTitle,
      metaDescription,
      metaKeywords: allKeywords.join(', '),
      tags: keywords,
      categories: category ? [category] : [],
    };
  }

  /**
   * Save article to database
   */
  private async saveArticle(data: ArticleData, author?: string): Promise<any> {
    const baseSlug = this.generateSlug(data.title);
    let slug = baseSlug;
    const readingTime = this.calculateReadingTime(data.content);
    const wordCount = this.calculateWordCount(data.content);

    // Ensure slug uniqueness by appending a numeric suffix if needed
    let counter = 1;
    while (true) {
      const existing = await this.prisma.article.findUnique({
        where: { slug },
      });

      if (!existing) break;

      // Found a collision — append suffix
      slug = `${baseSlug}-${counter}`;
      counter += 1;

      // Safety: avoid infinite loop
      if (counter > 1000) {
        throw new Error('Failed to generate a unique slug after 1000 attempts');
      }
    }

    if (slug !== baseSlug) {
      console.warn(`⚠️ Slug collision detected. Using fallback slug: ${slug}`);
    }

    // Create article with related data
    const article = await this.prisma.article.create({
      data: {
        title: data.title,
        slug,
        content: data.content,
        excerpt: data.excerpt,
        metaTitle: data.metaTitle || data.title,
        metaDescription: data.metaDescription || data.excerpt,
        metaKeywords: data.metaKeywords,
        author: author || 'Misbakhul Munir',
        status: 'DRAFT',
        tags: data.tags || [],
        categories: data.categories || [],
        readingTime,
        wordCount,
        articleContent: {
          create: {
            body: data.content,
            introduction: data.excerpt,
          },
        },
        articleSeo: {
          create: {
            focusKeyword: data.tags?.[0] || '',
            seoTitle: data.metaTitle || data.title,
            seoDescription: data.metaDescription || data.excerpt || '',
            keywordDensity: this.calculateKeywordDensity(data.content, data.tags || []),
            readabilityScore: this.calculateReadabilityScore(data.content),
          },
        },
      },
      include: {
        articleContent: true,
        articleSeo: true,
      },
    });

    // Export article to markdown file
    try {
      await this.articleExportService.exportToMarkdown({
        title: article.title,
        slug: article.slug,
        content: article.content,
        excerpt: article.excerpt || undefined,
        author: article.author || undefined,
        createdAt: article.createdAt,
        tags: article.tags || undefined,
        categories: article.categories || undefined,
        metaTitle: article.metaTitle || undefined,
        metaDescription: article.metaDescription || undefined,
        metaKeywords: article.metaKeywords || undefined,
        wordCount: article.wordCount || undefined,
        readingTime: article.readingTime || undefined,
      });
    } catch (error) {
      console.warn('⚠️ Failed to export article to markdown:', error);
      // Don't throw - article is saved to DB, markdown export is optional
    }

    return article;
  }

  /**
   * Calculate keyword density
   */
  private calculateKeywordDensity(content: string, keywords: string[]): Record<string, number> {
    const words = content.toLowerCase().split(/\s+/);
    const totalWords = words.length;
    const density: Record<string, number> = {};

    keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      const count = words.filter(word => word.includes(keywordLower)).length;
      density[keyword] = totalWords > 0 ? (count / totalWords) * 100 : 0;
    });

    return density;
  }

  /**
   * Simple readability score calculation (Flesch-like)
   */
  private calculateReadabilityScore(content: string): number {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = content.split(/\s+/);
    const syllables = words.reduce((acc, word) => {
      return acc + this.countSyllables(word);
    }, 0);

    if (sentences.length === 0 || words.length === 0) {
      return 0;
    }

    const avgSentenceLength = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;

    // Simplified Flesch Reading Ease
    const score = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);

    // Normalize to 0-100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Count syllables in a word (simplified)
   */
  private countSyllables(word: string): number {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }

  /**
   * Get article by ID
   */
  async getArticle(id: string) {
    return await this.prisma.article.findUnique({
      where: { id },
      include: {
        articleContent: true,
        articleSeo: true,
      },
    });
  }

  /**
   * Get all articles
   */
  async getArticles(status?: string, limit: number = 10, offset: number = 0) {
    return await this.prisma.article.findMany({
      where: status ? { status: status as any } : undefined,
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        articleContent: true,
        articleSeo: true,
      },
    });
  }

  /**
   * Update article status
   */
  async updateArticleStatus(id: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
    return await this.prisma.article.update({
      where: { id },
      data: { status },
    });
  }
}

