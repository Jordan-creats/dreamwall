/**
 * ═══════════════════════════════════════
 * 光影集 · 演示数据种子脚本（50条）
 * 用法: node seed.js
 * ═══════════════════════════════════════
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'gallery.db');

// ── 50 张壁纸数据 ──────────────────────
const wallpapers = [
  // ═══ 二次元 (anime) ═══
  { title:'星穹列车 · 银河之旅', album:'anime', tags:'二次元,星空,列车,幻想,银河', w:2560, h:1440, author:'Mika Pikazo' },
  { title:'樱花树下的约定', album:'anime', tags:'二次元,樱花,少女,唯美,春季', w:1920, h:1080, author:'监督' },
  { title:'霓虹雨夜的东京街角', album:'anime', tags:'二次元,赛博朋克,东京,雨夜,霓虹', w:3840, h:2160, author:'Wlop' },
  { title:'机械纪元 · 2B', album:'anime', tags:'二次元,尼尔,机械纪元,2B,科幻', w:2560, h:1440, author:'Yoko Taro' },
  { title:'夏日烟火大会', album:'anime', tags:'二次元,夏日,烟火,浴衣,祭典', w:1920, h:1280, author:'Makoto Shinkai' },
  { title:'魔法少女的星空', album:'anime', tags:'二次元,魔法少女,星空,幻想,治愈', w:2560, h:1600, author:'Ume Aoki' },
  { title:'龙与地下城的冒险', album:'anime', tags:'二次元,龙,奇幻,冒险,地牢', w:3440, h:1440, author:'Trigger' },
  { title:'初音未来 · 全息演唱会', album:'anime', tags:'二次元,初音未来,Vocaloid,演唱会,全息', w:2560, h:1440, author:'Crypton' },
  { title:'鬼灭之刃 · 火之神乐', album:'anime', tags:'二次元,鬼灭之刃,炭治郎,火焰,热血', w:1920, h:1080, author:'ufotable' },
  { title:'EVA 初号机暴走', album:'anime', tags:'二次元,EVA,初号机,机甲,暴走,紫色', w:3840, h:2160, author:'Khara' },

  // ═══ 赛博朋克 / 科技 (tech) ═══
  { title:'赛博朋克 2077 · 夜之城', album:'tech', tags:'赛博朋克,2077,夜之城,霓虹,未来', w:3840, h:2160, author:'CD Projekt Red' },
  { title:'量子计算机核心', album:'tech', tags:'科技,量子,计算机,电路,蓝光', w:2560, h:1440, author:'IBM Research' },
  { title:'未来城市 2187', album:'tech', tags:'科技,未来,城市,飞行器,全息', w:5120, h:2880, author:'Syd Mead' },
  { title:'人工智能神经网络', album:'tech', tags:'科技,AI,神经网络,数据流,蓝色', w:2560, h:1600, author:'DeepMind' },
  { title:'全息界面 · HUD', album:'tech', tags:'科技,全息,HUD,界面,透明,蓝色', w:1920, h:1080, author:'Oculus' },
  { title:'黑客帝国 · 数字雨', album:'tech', tags:'科技,黑客帝国,矩阵,代码,绿色', w:2560, h:1440, author:'Warner Bros' },
  { title:'机甲工厂 · 生产线', album:'tech', tags:'科技,机甲,工厂,工业,机械臂', w:3840, h:2160, author:'Boston Dynamics' },
  { title:'太空电梯 · 轨道站', album:'tech', tags:'科技,太空,电梯,轨道站,未来', w:5120, h:2160, author:'NASA' },
  { title:'生物芯片 · 微距', album:'tech', tags:'科技,芯片,微距,电路,绿光', w:1920, h:1440, author:'Intel' },
  { title:'脑机接口 · Neuralink', album:'tech', tags:'科技,脑机接口,Neuralink,神经,未来', w:2560, h:1440, author:'Neuralink' },

  // ═══ 风景 (scenery) ═══
  { title:'冰岛极光之夜', album:'scenery', tags:'风景,冰岛,极光,星空,冬季', w:5760, h:3840, author:'Max Rive' },
  { title:'富士山 · 逆富士', album:'scenery', tags:'风景,富士山,日本,湖泊,倒影,樱花', w:3840, h:2160, author:'Takashi Kitajima' },
  { title:'挪威峡湾 · 精灵之路', album:'scenery', tags:'风景,挪威,峡湾,瀑布,公路', w:5120, h:2880, author:'Mads Peter Iversen' },
  { title:'马尔代夫 · 荧光海', album:'scenery', tags:'风景,马尔代夫,海滩,荧光,星空', w:2560, h:1600, author:'Chris Burkard' },
  { title:'张家界 · 阿凡达山', album:'scenery', tags:'风景,张家界,山峰,云雾,仙境', w:3840, h:2560, author:'Zhang Kechun' },
  { title:'大峡谷 · 日落', album:'scenery', tags:'风景,大峡谷,日落,沙漠,红色', w:5120, h:2160, author:'Ansel Adams' },
  { title:'瑞士阿尔卑斯 · 雪峰', album:'scenery', tags:'风景,瑞士,阿尔卑斯,雪峰,湖泊', w:3840, h:2160, author:'Albert Dros' },
  { title:'撒哈拉星空', album:'scenery', tags:'风景,撒哈拉,沙漠,星空,银河', w:2560, h:1440, author:'Michael Shainblum' },
  { title:'桂林山水 · 漓江', album:'scenery', tags:'风景,桂林,漓江,山水,水墨', w:3840, h:2560, author:'Xie Hailong' },
  { title:'巴厘岛 · 天空之门', album:'scenery', tags:'风景,巴厘岛,寺庙,日出,倒影', w:2560, h:1600, author:'Jord Hammond' },

  // ═══ 游戏 (game) ═══
  { title:'艾尔登法环 · 黄金树', album:'game', tags:'游戏,艾尔登法环,黄金树,奇幻,史诗', w:3840, h:2160, author:'FromSoftware' },
  { title:'原神 · 璃月港', album:'game', tags:'游戏,原神,璃月,中国风,夜景', w:2560, h:1440, author:'miHoYo' },
  { title:'巫师3 · 陶森特', album:'game', tags:'游戏,巫师3,陶森特,中世纪,城堡', w:3840, h:2160, author:'CD Projekt Red' },
  { title:'最终幻想7 · 米德加', album:'game', tags:'游戏,最终幻想,米德加,克劳德,蒸汽朋克', w:2560, h:1440, author:'Square Enix' },
  { title:'塞尔达 · 海拉尔大陆', album:'game', tags:'游戏,塞尔达,海拉尔,旷野,冒险', w:3840, h:2160, author:'Nintendo' },
  { title:'死亡搁浅 · BT 区', album:'game', tags:'游戏,死亡搁浅,BT,末世,荒凉', w:2560, h:1440, author:'Kojima Productions' },
  { title:'战神 · 九界之巅', album:'game', tags:'游戏,战神,奎托斯,北欧,史诗', w:3840, h:2160, author:'Santa Monica Studio' },
  { title:'星际战甲 · 虚空', album:'game', tags:'游戏,星际战甲,虚空,科幻,机甲', w:2560, h:1440, author:'Digital Extremes' },
  { title:'黑神话 · 悟空', album:'game', tags:'游戏,黑神话,悟空,西游记,中国风', w:3840, h:2160, author:'Game Science' },
  { title:'赛博朋克 · 边缘行者', album:'game', tags:'游戏,赛博朋克,边缘行者,动漫,科幻', w:2560, h:1440, author:'Studio Trigger' },

  // ═══ 萌宠 (pet) ═══
  { title:'柴犬的午后时光', album:'pet', tags:'萌宠,柴犬,可爱,阳光,日本', w:2560, h:1600, author:' PetCollective' },
  { title:'布偶猫 · 蓝色眼眸', album:'pet', tags:'萌宠,布偶猫,蓝眼,毛绒,可爱', w:1920, h:1440, author:'Neko Atsume' },
  { title:'哈士奇的迷惑行为', album:'pet', tags:'萌宠,哈士奇,搞笑,雪地,蓝色眼睛', w:2560, h:1600, author:'DogRates' },
  { title:'柯基犬 · 蜜桃臀', album:'pet', tags:'萌宠,柯基,可爱,草地,阳光', w:1920, h:1280, author:'CorgiDaily' },
  { title:'暹罗猫 · 异瞳', album:'pet', tags:'萌宠,暹罗猫,异瞳,优雅,泰国', w:2560, h:1600, author:'SiameseWorld' },

  // ═══ 美女 (girl) ═══
  { title:'赛博朋克风格少女', album:'girl', tags:'美女,赛博朋克,少女,霓虹,未来感', w:2560, h:1600, author:'Ilya Kuvshinov' },
  { title:'和风 · 花魁', album:'girl', tags:'美女,和风,花魁,传统,华丽', w:1920, h:2880, author:'Kazuhiro Hori' },
  { title:'极简主义人像', album:'girl', tags:'美女,极简,黑白,光影,情绪', w:2560, h:1600, author:'Peter Lindbergh' },
  { title:'未来战士 · She', album:'girl', tags:'美女,科幻,战士,机甲,未来', w:3840, h:2160, author:'Craig Mullins' },
  { title:'敦煌飞天 · 国风', album:'girl', tags:'美女,敦煌,飞天,国风,飘逸', w:1920, h:2880, author:'莲羊' },

  // ═══ 动态壁纸 (live) ═══
  { title:'雨中城市 · 车窗', album:'live', tags:'动态,雨夜,城市,车窗,霓虹,氛围', w:1920, h:1080, author:'VisualLoop' },
  { title:'粒子星云 · 银河', album:'live', tags:'动态,粒子,星云,银河,太空', w:2560, h:1440, author:'SpaceEngine' },
];

// ── 生成 Picsum 图片 URL ──────────────
function getImageUrl(i, w, h) {
  // Picsum 提供稳定的随机图片，基于 seed 保证一致性
  return `https://picsum.photos/seed/wp${i}/${w}/${h}`;
}

// ── 主函数 ────────────────────────────
async function seed() {
  // Kill any existing connection
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  console.log('📦 数据库已连接:', DB_PATH);

  // 确保有 admin 用户
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  const uploaderId = admin ? admin.id : null;
  if (!uploaderId) {
    console.log('⚠️  未找到管理员用户，设置 uploader_id 为 NULL');
  }

  // 获取 album slug → id 映射
  const albums = db.prepare('SELECT id, slug FROM albums').all();
  const albumMap = {};
  albums.forEach(a => { albumMap[a.slug] = a.id; });
  console.log('📁 分类映射:', Object.keys(albumMap).join(', '));

  // 清空旧演示数据
  const oldCount = db.prepare('SELECT COUNT(*) AS c FROM photos').get().c;
  if (oldCount > 0) {
    console.log(`🗑️  清空 ${oldCount} 条旧数据...`);
    db.prepare('DELETE FROM photos').run();
    db.prepare('DELETE FROM favorites').run();
    db.prepare('DELETE FROM downloads').run();
  }

  // 插入新数据
  const insert = db.prepare(`
    INSERT INTO photos (album_id, uploader_id, filename, original_name, title, tags,
                        media_type, url, width, height, file_size, download_count, status)
    VALUES (?, ?, ?, ?, ?, ?, 'image', ?, ?, ?, ?, ?, 'approved')
  `);

  const seedAll = db.transaction(() => {
    wallpapers.forEach((wp, i) => {
      const albumId = albumMap[wp.album] || null;
      const filename = `seed-${String(i + 1).padStart(2, '0')}.jpg`;
      const imageUrl = getImageUrl(i + 1, wp.w || 1920, wp.h || 1080);
      const downloads = Math.floor(Math.random() * 8000) + 200;
      const fileSize = Math.floor(Math.random() * 4000000) + 500000; // 0.5MB ~ 4.5MB

      insert.run(
        albumId,
        uploaderId,
        filename,
        `${wp.title}.jpg`,
        wp.title,
        wp.tags,
        imageUrl,          // ★ 直接存外部 URL，无需上传
        wp.w || 1920,
        wp.h || 1080,
        fileSize,
        downloads
      );
    });
  });

  seedAll();
  console.log(`✅ 成功插入 ${wallpapers.length} 条壁纸数据！`);

  // 验证
  const total = db.prepare('SELECT COUNT(*) AS c FROM photos').get().c;
  const approved = db.prepare("SELECT COUNT(*) AS c FROM photos WHERE status = 'approved'").get().c;
  const albumsWithCount = db.prepare(`
    SELECT a.name, COUNT(p.id) AS cnt FROM albums a LEFT JOIN photos p ON p.album_id = a.id GROUP BY a.id ORDER BY cnt DESC
  `).all();

  console.log(`📊 总计: ${total} 条 (已审核: ${approved})`);
  console.log('📁 分类分布:');
  albumsWithCount.forEach(a => console.log(`   ${a.name}: ${a.cnt} 张`));

  db.close();
  console.log('\n🎉 种子数据生成完毕！重启服务器即可看到效果。');
}

seed().catch(err => {
  console.error('❌ 种子脚本失败:', err.message);
  process.exit(1);
});
