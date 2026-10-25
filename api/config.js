import {json,method,PLANS} from '../lib/server.js';
export default function handler(req,res){ if(!method(req,res,['GET'])) return; json(res,200,{appName:'Modify Plus Cut',maxWordsPerRequest:20000,freeCredits:{modify:20000,cut:20000},plans:PLANS,termsVersion:'1'}); }
