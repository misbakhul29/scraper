import * as fs from 'fs';
import * as path from 'path';

export interface ArticleExportData {
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  author?: string;
  createdAt: Date;
  tags?: string[];
  categories?: string[];
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  wordCount?: number;
  readingTime?: number;
}

export class ArticleExportService {
  private readonly exportDir: string;

  constructor(exportDir: string = 'articles') {
    this.exportDir = exportDir;
    this.ensureExportDirectory();
  }

  /**
   * Ensure export directory exists
   */
  private ensureExportDirectory(): void {
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
      console.log(`✅ Created export directory: ${this.exportDir}`);
    }
  }

  /**
   * Format date to YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Generate filename: slug-yyyy-mm-dd.md
   */
  private generateFilename(slug: string, createdAt: Date): string {
    const dateStr = this.formatDate(createdAt);
    return `${slug}-${dateStr}.md`;
  }

  /**
   * Convert article data to YAML frontmatter
   */
  private generateYamlFrontmatter(data: ArticleExportData): string {
    const frontmatter: Record<string, any> = {
      title: data.title,
      date: data.createdAt.toISOString(),
      draft: true, // Default to draft, can be changed later
    };

    if (data.excerpt) {
      frontmatter.description = data.excerpt;
    }

    if (data.author) {
      frontmatter.author = data.author;
    }

    if (data.categories && data.categories.length > 0) {
      frontmatter.categories = data.categories;
    }

    if (data.tags && data.tags.length > 0) {
      frontmatter.tags = data.tags;
    }

    // Add SEO metadata
    if (data.metaTitle) {
      frontmatter.metaTitle = data.metaTitle;
    }

    if (data.metaDescription) {
      frontmatter.metaDescription = data.metaDescription;
    }

    if (data.metaKeywords) {
      frontmatter.keywords = data.metaKeywords;
    }

    // Add reading time and word count if available
    if (data.readingTime) {
      frontmatter.readingTime = data.readingTime;
    }

    if (data.wordCount) {
      frontmatter.wordCount = data.wordCount;
    }

    // Convert to YAML format
    const yamlLines: string[] = ['---'];
    
    for (const [key, value] of Object.entries(frontmatter)) {
      if (value === undefined || value === null) {
        continue;
      }

      if (Array.isArray(value)) {
        if (value.length > 0) {
          yamlLines.push(`${key}:`);
          value.forEach((item) => {
            yamlLines.push(`  - ${this.escapeYamlValue(String(item))}`);
          });
        }
      } else if (typeof value === 'string') {
        // Escape strings that might cause YAML parsing issues
        const escaped = this.escapeYamlValue(value);
        yamlLines.push(`${key}: ${escaped}`);
      } else if (typeof value === 'boolean' || typeof value === 'number') {
        yamlLines.push(`${key}: ${value}`);
      } else {
        yamlLines.push(`${key}: ${this.escapeYamlValue(String(value))}`);
      }
    }

    yamlLines.push('---');
    return yamlLines.join('\n');
  }

  /**
   * Escape YAML values that might contain special characters
   */
  private escapeYamlValue(value: string): string {
    // If value contains special characters, wrap in quotes
    if (
      value.includes(':') ||
      value.includes('"') ||
      value.includes("'") ||
      value.includes('\n') ||
      value.includes('[') ||
      value.includes(']') ||
      value.includes('{') ||
      value.includes('}') ||
      value.startsWith(' ') ||
      value.endsWith(' ') ||
      value.includes('#')
    ) {
      // Escape double quotes and wrap in double quotes
      const escaped = value.replace(/"/g, '\\"');
      return `"${escaped}"`;
    }
    return value;
  }

  /**
   * Export article to markdown file with YAML frontmatter
   */
  async exportToMarkdown(article: ArticleExportData): Promise<string> {
    try {
      // Generate filename
      const filename = this.generateFilename(article.slug, article.createdAt);
      const filepath = path.join(this.exportDir, filename);

      // Generate YAML frontmatter
      const frontmatter = this.generateYamlFrontmatter(article);

      // Combine frontmatter and content
      const markdownContent = `${frontmatter}\n\n${article.content}`;

      // Write to file
      fs.writeFileSync(filepath, markdownContent, 'utf-8');

      console.log(`✅ Article exported to: ${filepath}`);
      return filepath;
    } catch (error) {
      throw new Error(
        `Failed to export article to markdown: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get export directory path
   */
  getExportDirectory(): string {
    return path.resolve(this.exportDir);
  }
}

