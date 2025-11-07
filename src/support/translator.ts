import * as fs from 'fs';
import * as path from 'path';

type Translations = Record<string, Record<string, string>>;

export class Translator {
  private static instance: Translator;
  private lang: string;
  private translations: Translations = {};
  private translationPath: string;

  private constructor(lang: string = 'cn') {
    this.lang = lang;
    this.translationPath = path.join(__dirname, `../../data/translations-${lang}.json`);
    this.loadTranslations();
  }

  public static getInstance(lang: string = 'cn'): Translator {
    if (!Translator.instance) {
      Translator.instance = new Translator(lang);
    } else if (Translator.instance.lang !== lang) {
      Translator.instance.lang = lang;
      Translator.instance.translationPath = path.join(__dirname, `../../data/translations-${lang}.json`);
      Translator.instance.loadTranslations();
    }
    return Translator.instance;
  }

  private loadTranslations(): void {
    try {
      if (fs.existsSync(this.translationPath)) {
        this.translations = JSON.parse(fs.readFileSync(this.translationPath, 'utf8'));
      } else {
        console.log(`⚠ 未找到翻译文件: ${this.translationPath}，将使用英文显示\n`);
      }
    } catch (error: any) {
      console.log('⚠ 加载翻译文件失败:', error.message);
      console.log('  将使用英文显示\n');
      this.translations = {};
    }
  }

  public translate(text: string, category: string = 'moves'): string {
    const map = this.translations[category];
    return map?.[text] || text;
  }
}
