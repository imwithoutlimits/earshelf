/** Translations Tapestry can offer. Each one is public domain per its eBible.org page (checked October 2026). Add another only after reading its license and recording it in LICENSES.md. */
export interface TranslationInfo { id: string; abbreviation: string; name: string; description: string; notice: string; licenseUrl: string }
export const DEFAULT_TRANSLATION = 'engwebp';
export const TRANSLATIONS: TranslationInfo[] = [
  { id: 'engwebp', abbreviation: 'WEB', name: 'World English Bible', description: 'Modern English that stays close to the original languages. An update of the American Standard Version.',
    notice: 'The World English Bible is in the public domain. "World English Bible" is a trademark of eBible.org: if the text is changed in any way, it must not be called the World English Bible.', licenseUrl: 'https://ebible.org/Scriptures/details.php?id=engwebp' },
  { id: 'engbsb', abbreviation: 'BSB', name: 'Berean Standard Bible', description: 'Modern English that balances word-for-word accuracy with readability.',
    notice: 'The Holy Bible, Berean Standard Bible, BSB is produced in cooperation with Bible Hub, Discovery Bible, OpenBible.com, and the Berean Bible Translation Committee. This text of God\u2019s Word has been dedicated to the public domain. Apps that keep the verbatim text may use the Berean name; a changed text should not.', licenseUrl: 'https://ebible.org/details.php?id=engbsb' },
  { id: 'eng-kjv2006', abbreviation: 'KJV', name: 'King James Version', description: 'The classic 1769 text of the 1611 translation, in older English.',
    notice: 'The King James Version (1769 text) is in the public domain. In the United Kingdom the Crown holds letters patent for printing it; that has no effect elsewhere. Text courtesy of the Crosswire Bible Society and eBible.org.', licenseUrl: 'https://ebible.org/details.php?id=eng-kjv2006' },
  { id: 'eng-asv', abbreviation: 'ASV', name: 'American Standard Version', description: 'The 1901 American revision of the King James Version, careful and literal, in older English.',
    notice: 'The American Standard Version (1901) is in the public domain. Text courtesy of eBible.org.', licenseUrl: 'https://ebible.org/details.php?id=eng-asv' },
];
export const translationById = (id: string): TranslationInfo | undefined => TRANSLATIONS.find((t) => t.id === id);
