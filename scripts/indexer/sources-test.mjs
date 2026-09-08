import assert from 'node:assert/strict';
import {xmlLinks} from './sources.mjs';

const base='https://example.org/education/';
assert.deepEqual(xmlLinks('<urlset><url><loc>https://example.org/education/a?q=1&amp;y=2</loc></url></urlset>',base),['https://example.org/education/a?q=1&y=2']);
assert.deepEqual(xmlLinks('<feed><entry><link href="lesson"/></entry></feed>',base),[base+'lesson']);
assert.deepEqual(xmlLinks('<rss><channel><item><link>exam</link></item></channel></rss>',base),[base+'exam']);
assert.deepEqual(xmlLinks('<sitemapindex><sitemap><loc>map.xml</loc></sitemap></sitemapindex>',base),[base+'map.xml']);
assert.throws(()=>xmlLinks('<!DOCTYPE rss [<!ENTITY value SYSTEM "file:///private">]><rss/>',base));
assert.throws(()=>xmlLinks('<a>'.repeat(50)+'</a>'.repeat(50),base));
console.log('Sitemap, RSS, Atom links and XML safety checks passed.');
