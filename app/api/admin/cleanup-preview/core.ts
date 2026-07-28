import { normalizeAdminEmail } from "../access.ts";

type TableRow = { name:string };
type ColumnRow = { name:string };
type CountRow = { count:number };
type ObjectReference = { owner:string; key:string };

const knownUserTables = [
  "profiles",
  "validations",
  "responses",
  "analyses",
  "presence",
  "study_files",
  "points_ledger",
  "redemptions",
] as const;

const directOwnerColumns = [
  "email",
  "profile_email",
  "creator_email",
  "contributor_email",
  "owner_email",
  "user_email",
] as const;

function safeIdentifier(value:string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error("Unsafe database identifier");
  return `"${value}"`;
}

function placeholders(length:number) {
  return Array.from({length},()=>"?").join(",");
}

function nonAdminPredicate(column:string, adminEmails:string[]) {
  return `${column} IS NOT NULL AND TRIM(${column}) != '' AND LOWER(TRIM(${column})) NOT IN (${placeholders(adminEmails.length)})`;
}

async function count(db:D1Database, sql:string, bindings:unknown[] = []) {
  const statement=db.prepare(sql);
  const row = await (bindings.length?statement.bind(...bindings):statement).first<CountRow>();
  return Number(row?.count ?? 0);
}

async function columnsFor(db:D1Database, table:string) {
  const result = await db.prepare(`PRAGMA table_info(${safeIdentifier(table)})`).all<ColumnRow>();
  return new Set(result.results.map(row=>String(row.name)));
}

const MAX_R2_LIST_PAGES=100;
const MAX_R2_LIST_OBJECTS=50_000;

async function listBucketKeys(bucket:R2Bucket, prefix:string) {
  const keys:string[]=[];
  let cursor:string|undefined;
  let incomplete=false;
  let pages=0;
  do {
    const page=await bucket.list({prefix,cursor,limit:1000});
    pages++;
    const remaining=MAX_R2_LIST_OBJECTS-keys.length;
    keys.push(...page.objects.slice(0,Math.max(0,remaining)).map(object=>object.key));
    if(page.objects.length>remaining){incomplete=true;break;}
    if(!page.truncated){cursor=undefined;break;}
    if(!page.cursor||pages>=MAX_R2_LIST_PAGES||keys.length>=MAX_R2_LIST_OBJECTS){
      incomplete=true;
      break;
    }
    cursor=page.cursor;
  } while(cursor);
  return {keys,incomplete};
}

function noStoreJson(body:unknown,status=200) {
  return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
}

export async function buildCleanupPreview(db:D1Database,bucket:R2Bucket,rawAdminEmails:string[]) {
  const adminEmails=[...new Set(rawAdminEmails.map(normalizeAdminEmail).filter(Boolean))];
  if(!adminEmails.length)throw new Error("Admin allowlist is empty");

  const schemaResult=await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all<TableRow>();
  const tables=schemaResult.results.map(row=>String(row.name)).filter(name=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(name));
  const tableSet=new Set(tables);
  const columnMap=new Map<string,Set<string>>();
  for(const table of tables)columnMap.set(table,await columnsFor(db,table));
  const hasColumns=(table:string,...columns:string[])=>tableSet.has(table)&&columns.every(column=>columnMap.get(table)?.has(column));

  const records:Record<string,{total:number;nonAdminOwned:number;affected:number}>={};
  const adminArgs=adminEmails;
  const directCount=async(table:string,column:string)=>{
    if(!tableSet.has(table)||!columnMap.get(table)?.has(column))return 0;
    return count(db,`SELECT COUNT(*) AS count FROM ${safeIdentifier(table)} WHERE ${nonAdminPredicate(safeIdentifier(column),adminEmails)}`,adminArgs);
  };
  const totalCount=async(table:string)=>tableSet.has(table)
    ?count(db,`SELECT COUNT(*) AS count FROM ${safeIdentifier(table)}`)
    :0;

  const nonAdminProfiles=await directCount("profiles","email");
  const nonAdminValidations=await directCount("validations","creator_email");
  const nonAdminResponses=await directCount("responses","contributor_email");
  const nonAdminPresence=await directCount("presence","email");
  const nonAdminStudyFiles=await directCount("study_files","owner_email");
  const nonAdminLedger=await directCount("points_ledger","profile_email");
  const nonAdminRedemptions=await directCount("redemptions","profile_email");

  const responseRelationsAvailable=hasColumns("responses","validation_id","contributor_email")
    &&hasColumns("validations","id","creator_email");
  const affectedResponses=responseRelationsAvailable
    ?await count(db,`SELECT COUNT(*) AS count FROM responses r
      LEFT JOIN validations v ON v.id = r.validation_id
      WHERE ${nonAdminPredicate("r.contributor_email",adminEmails)}
        OR ${nonAdminPredicate("v.creator_email",adminEmails)}`,[...adminArgs,...adminArgs])
    :nonAdminResponses;
  const analysisRelationsAvailable=hasColumns("analyses","validation_id")
    &&hasColumns("validations","id","creator_email");
  const affectedAnalyses=analysisRelationsAvailable
    ?await count(db,`SELECT COUNT(*) AS count FROM analyses a
      JOIN validations v ON v.id = a.validation_id
      WHERE ${nonAdminPredicate("v.creator_email",adminEmails)}`,adminArgs)
    :0;

  const adminOnNonAdminIdea=responseRelationsAvailable
    ?await count(db,`SELECT COUNT(*) AS count FROM responses r
      JOIN validations v ON v.id = r.validation_id
      WHERE LOWER(TRIM(r.contributor_email)) IN (${placeholders(adminEmails.length)})
        AND ${nonAdminPredicate("v.creator_email",adminEmails)}`,[...adminArgs,...adminArgs])
    :0;
  const nonAdminOnAdminIdea=responseRelationsAvailable
    ?await count(db,`SELECT COUNT(*) AS count FROM responses r
      JOIN validations v ON v.id = r.validation_id
      WHERE ${nonAdminPredicate("r.contributor_email",adminEmails)}
        AND LOWER(TRIM(v.creator_email)) IN (${placeholders(adminEmails.length)})`,[...adminArgs,...adminArgs])
    :0;

  let affectedLedger=nonAdminLedger;
  if(hasColumns("points_ledger","profile_email","reference_type","reference_id")){
    const referenceClauses:string[]=[];
    const referenceArgs:string[]=[];
    if(hasColumns("validations","id","creator_email")){
      referenceClauses.push(`(reference_type = 'validation' AND CAST(reference_id AS INTEGER) IN
        (SELECT id FROM validations WHERE ${nonAdminPredicate("creator_email",adminEmails)}))`);
      referenceArgs.push(...adminArgs);
    }
    if(responseRelationsAvailable&&hasColumns("responses","id")){
      referenceClauses.push(`(reference_type = 'response' AND CAST(reference_id AS INTEGER) IN
        (SELECT r.id FROM responses r LEFT JOIN validations v ON v.id = r.validation_id
          WHERE ${nonAdminPredicate("r.contributor_email",adminEmails)}
            OR ${nonAdminPredicate("v.creator_email",adminEmails)}))`);
      referenceArgs.push(...adminArgs,...adminArgs);
    }
    if(hasColumns("redemptions","id","profile_email")){
      referenceClauses.push(`(reference_type = 'redemption' AND CAST(reference_id AS INTEGER) IN
        (SELECT id FROM redemptions WHERE ${nonAdminPredicate("profile_email",adminEmails)}))`);
      referenceArgs.push(...adminArgs);
    }
    const clauses=[nonAdminPredicate("profile_email",adminEmails),...referenceClauses];
    affectedLedger=await count(db,`SELECT COUNT(*) AS count FROM points_ledger WHERE ${clauses.map(clause=>`(${clause})`).join(" OR ")}`,[...adminArgs,...referenceArgs]);
  }

  const knownDirect:Record<string,number>={
    profiles:nonAdminProfiles,
    validations:nonAdminValidations,
    responses:nonAdminResponses,
    analyses:affectedAnalyses,
    presence:nonAdminPresence,
    study_files:nonAdminStudyFiles,
    points_ledger:nonAdminLedger,
    redemptions:nonAdminRedemptions,
  };
  const affected:Record<string,number>={
    profiles:nonAdminProfiles,
    validations:nonAdminValidations,
    responses:affectedResponses,
    analyses:affectedAnalyses,
    presence:nonAdminPresence,
    study_files:nonAdminStudyFiles,
    points_ledger:affectedLedger,
    redemptions:nonAdminRedemptions,
  };
  for(const table of knownUserTables){
    records[table]={total:await totalCount(table),nonAdminOwned:knownDirect[table],affected:affected[table]};
  }

  const otherUserAssociatedTables:Array<{table:string;total:number;nonAdminOwned:number}>=[];
  for(const table of tables.filter(name=>!knownUserTables.includes(name as typeof knownUserTables[number]))){
    const ownerColumn=directOwnerColumns.find(column=>columnMap.get(table)?.has(column));
    if(!ownerColumn)continue;
    otherUserAssociatedTables.push({
      table,
      total:await totalCount(table),
      nonAdminOwned:await directCount(table,ownerColumn),
    });
  }

  const orphanCounts:Record<string,number>={};
  if(hasColumns("responses","validation_id")&&hasColumns("validations","id")){
    orphanCounts.responsesWithoutValidation=await count(db,
      "SELECT COUNT(*) AS count FROM responses r LEFT JOIN validations v ON v.id = r.validation_id WHERE v.id IS NULL");
  }
  if(hasColumns("analyses","validation_id")&&hasColumns("validations","id")){
    orphanCounts.analysesWithoutValidation=await count(db,
      "SELECT COUNT(*) AS count FROM analyses a LEFT JOIN validations v ON v.id = a.validation_id WHERE v.id IS NULL");
  }
  if(hasColumns("study_files","owner_email")&&hasColumns("profiles","id","email")){
    orphanCounts.filesWithoutProfile=await count(db,`SELECT COUNT(*) AS count FROM study_files f
      LEFT JOIN profiles p ON LOWER(TRIM(p.email)) = LOWER(TRIM(f.owner_email)) WHERE p.id IS NULL`);
  }
  const potentialOrphans=Object.values(orphanCounts).reduce((sum,value)=>sum+value,0);

  const references=new Map<string,boolean>();
  if(hasColumns("profiles","email","avatar_key")){
    const result=await db.prepare("SELECT email AS owner, avatar_key AS key FROM profiles WHERE avatar_key IS NOT NULL AND TRIM(avatar_key) != ''").all<ObjectReference>();
    for(const row of result.results)references.set(String(row.key),adminEmails.includes(normalizeAdminEmail(row.owner)));
  }
  if(hasColumns("study_files","owner_email","object_key")){
    const result=await db.prepare("SELECT owner_email AS owner, object_key AS key FROM study_files WHERE object_key IS NOT NULL AND TRIM(object_key) != ''").all<ObjectReference>();
    for(const row of result.results)references.set(String(row.key),adminEmails.includes(normalizeAdminEmail(row.owner)));
  }

  let adminObjects=0;
  let nonAdminObjects=0;
  let metadataMissingObject=0;
  for(const [key,isAdmin] of references){
    const object=await bucket.head(key);
    if(!object){metadataMissingObject++;continue;}
    if(isAdmin)adminObjects++;else nonAdminObjects++;
  }
  const [avatarListing,studyFileListing]=await Promise.all([
    listBucketKeys(bucket,"avatars/"),
    listBucketKeys(bucket,"study-files/"),
  ]);
  const listedKeys=new Set([...avatarListing.keys,...studyFileListing.keys]);
  const objectsWithoutOwnership=[...listedKeys].filter(key=>!references.has(key)).length;
  const incomplete=avatarListing.incomplete||studyFileListing.incomplete;
  const missingExpectedTables=knownUserTables.filter(table=>!tableSet.has(table));
  const warnings:string[]=[];
  if(incomplete)warnings.push("R2 listing reached the safety limit; object counts are partial.");
  if(missingExpectedTables.length||otherUserAssociatedTables.length)warnings.push("Production schema differs from the expected local cleanup model.");

  return {
    generatedAt:new Date().toISOString(),
    readOnly:true,
    incomplete,
    warnings,
    schema:{
      tableCount:tables.length,
      userAssociatedTableCount:knownUserTables.filter(table=>tableSet.has(table)).length+otherUserAssociatedTables.length,
      missingExpectedTables,
      otherUserAssociatedTables,
    },
    records,
    crossUser:{
      adminResponsesOnNonAdminIdeas:adminOnNonAdminIdea,
      nonAdminResponsesOnAdminIdeas:nonAdminOnAdminIdea,
      affectedAnalyses,
      affectedPointsLedger:affectedLedger,
      potentialOrphans,
      orphanCounts,
    },
    r2:{
      adminObjects,
      nonAdminObjects,
      metadataMissingObject,
      objectsWithoutOwnership,
    },
    recommendedDeletionOrder:[
      "Create and verify D1, Auth mapping, and R2 object-list backups",
      "Revoke non-Admin sessions",
      "Resolve cross-user Admin responses attached to non-Admin validations",
      "Delete analyses linked to non-Admin validations",
      "Delete affected points-ledger references",
      "Delete responses owned by non-Admins or linked to non-Admin validations",
      "Delete non-Admin validations",
      "Delete non-Admin redemptions and presence rows",
      "Delete verified non-Admin R2 avatar and study-file objects",
      "Delete non-Admin study-file metadata and profiles",
      "Delete non-Admin Supabase Auth users last",
      "Run orphan and retained-Admin integrity checks",
    ],
  };
}

export { noStoreJson };
