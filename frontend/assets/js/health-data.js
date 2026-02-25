// ========== Health Data Module ==========
// Static data for meridian visualization and baduanjin exercises.
// Ported from MeridianMap TypeScript sources to vanilla JS IIFE.
var HealthData = (function() {
    'use strict';

    // =========================================================================
    // Body Outline — front and back view contour coordinates (0-1 normalized)
    // =========================================================================

    function mirrorPoints(pts) {
        return pts.map(function(p) { return { x: 1 - p.x, y: p.y }; });
    }

    // Front view
    var frontHead = [
        {x:0.50,y:0.000},{x:0.53,y:0.003},{x:0.56,y:0.012},{x:0.58,y:0.025},
        {x:0.585,y:0.040},{x:0.58,y:0.055},{x:0.575,y:0.065},{x:0.56,y:0.080},
        {x:0.54,y:0.093},{x:0.52,y:0.098},{x:0.50,y:0.100},{x:0.48,y:0.098},
        {x:0.46,y:0.093},{x:0.44,y:0.080},{x:0.425,y:0.065},{x:0.42,y:0.055},
        {x:0.415,y:0.040},{x:0.42,y:0.025},{x:0.44,y:0.012},{x:0.47,y:0.003}
    ];
    var frontNeckLeft = [{x:0.46,y:0.100},{x:0.45,y:0.110},{x:0.44,y:0.120},{x:0.43,y:0.130}];
    var frontNeckRight = mirrorPoints(frontNeckLeft);
    var frontTorsoLeft = [
        {x:0.36,y:0.150},{x:0.37,y:0.180},{x:0.38,y:0.220},{x:0.39,y:0.270},
        {x:0.41,y:0.320},{x:0.42,y:0.360},{x:0.42,y:0.380},{x:0.43,y:0.400}
    ];
    var frontTorsoRight = mirrorPoints(frontTorsoLeft);
    var frontArmLeftOuter = [
        {x:0.36,y:0.150},{x:0.34,y:0.170},{x:0.32,y:0.200},{x:0.29,y:0.240},
        {x:0.27,y:0.280},{x:0.26,y:0.310},{x:0.24,y:0.350},{x:0.22,y:0.390},
        {x:0.21,y:0.410},{x:0.22,y:0.430}
    ];
    var frontArmLeftInner = [
        {x:0.38,y:0.160},{x:0.37,y:0.180},{x:0.35,y:0.210},{x:0.33,y:0.250},
        {x:0.31,y:0.280},{x:0.30,y:0.310},{x:0.28,y:0.350},{x:0.27,y:0.390},
        {x:0.26,y:0.410},{x:0.26,y:0.430}
    ];
    var frontArmRightOuter = mirrorPoints(frontArmLeftOuter);
    var frontArmRightInner = mirrorPoints(frontArmLeftInner);
    var frontLegLeftOuter = [
        {x:0.43,y:0.400},{x:0.42,y:0.430},{x:0.41,y:0.470},{x:0.40,y:0.520},
        {x:0.40,y:0.560},{x:0.40,y:0.610},{x:0.40,y:0.650},{x:0.40,y:0.700},
        {x:0.40,y:0.750},{x:0.40,y:0.810},{x:0.41,y:0.870},{x:0.40,y:0.900},
        {x:0.38,y:0.920}
    ];
    var frontLegLeftInner = [
        {x:0.48,y:0.400},{x:0.48,y:0.430},{x:0.48,y:0.470},{x:0.47,y:0.520},
        {x:0.47,y:0.560},{x:0.47,y:0.610},{x:0.47,y:0.650},{x:0.47,y:0.700},
        {x:0.46,y:0.750},{x:0.46,y:0.810},{x:0.45,y:0.870},{x:0.45,y:0.900},
        {x:0.45,y:0.920}
    ];
    var frontLegRightOuter = mirrorPoints(frontLegLeftOuter);
    var frontLegRightInner = mirrorPoints(frontLegLeftInner);

    // Back view
    var backHead = frontHead.slice();
    var backNeckLeft = frontNeckLeft.slice();
    var backNeckRight = mirrorPoints(backNeckLeft);
    var backTorsoLeft = [
        {x:0.36,y:0.150},{x:0.35,y:0.180},{x:0.34,y:0.200},{x:0.36,y:0.220},
        {x:0.38,y:0.250},{x:0.39,y:0.280},{x:0.41,y:0.320},{x:0.42,y:0.360},
        {x:0.42,y:0.380},{x:0.43,y:0.400}
    ];
    var backTorsoRight = mirrorPoints(backTorsoLeft);
    var backArmLeftOuter = frontArmLeftOuter.slice();
    var backArmLeftInner = frontArmLeftInner.slice();
    var backArmRightOuter = mirrorPoints(backArmLeftOuter);
    var backArmRightInner = mirrorPoints(backArmLeftInner);
    var backLegLeftOuter = frontLegLeftOuter.slice();
    var backLegLeftInner = frontLegLeftInner.slice();
    var backLegRightOuter = mirrorPoints(backLegLeftOuter);
    var backLegRightInner = mirrorPoints(backLegLeftInner);

    var BODY_OUTLINE = {
        front: {
            head: frontHead, torsoLeft: frontTorsoLeft, torsoRight: frontTorsoRight,
            armLeftOuter: frontArmLeftOuter, armLeftInner: frontArmLeftInner,
            armRightOuter: frontArmRightOuter, armRightInner: frontArmRightInner,
            legLeftOuter: frontLegLeftOuter, legLeftInner: frontLegLeftInner,
            legRightOuter: frontLegRightOuter, legRightInner: frontLegRightInner,
            neckLeft: frontNeckLeft, neckRight: frontNeckRight
        },
        back: {
            head: backHead, torsoLeft: backTorsoLeft, torsoRight: backTorsoRight,
            armLeftOuter: backArmLeftOuter, armLeftInner: backArmLeftInner,
            armRightOuter: backArmRightOuter, armRightInner: backArmRightInner,
            legLeftOuter: backLegLeftOuter, legLeftInner: backLegLeftInner,
            legRightOuter: backLegRightOuter, legRightInner: backLegRightInner,
            neckLeft: backNeckLeft, neckRight: backNeckRight
        }
    };

    // =========================================================================
    // Standing Pose — 13 skeletal joints
    // =========================================================================

    var STANDING_POSE = {
        head:      {x:0.50,y:0.05}, neck:      {x:0.50,y:0.12},
        shoulderL: {x:0.36,y:0.15}, shoulderR: {x:0.64,y:0.15},
        elbowL:    {x:0.30,y:0.28}, elbowR:    {x:0.70,y:0.28},
        wristL:    {x:0.25,y:0.40}, wristR:    {x:0.75,y:0.40},
        hip:       {x:0.50,y:0.42},
        kneeL:     {x:0.44,y:0.65}, kneeR:     {x:0.56,y:0.65},
        ankleL:    {x:0.43,y:0.87}, ankleR:    {x:0.57,y:0.87}
    };

    var JOINT_KEYS = [
        'head','neck','shoulderL','shoulderR','elbowL','elbowR',
        'wristL','wristR','hip','kneeL','kneeR','ankleL','ankleR'
    ];

    function lerpPose(a, b, t) {
        var result = {};
        for (var i = 0; i < JOINT_KEYS.length; i++) {
            var k = JOINT_KEYS[i];
            result[k] = {
                x: a[k].x + (b[k].x - a[k].x) * t,
                y: a[k].y + (b[k].y - a[k].y) * t
            };
        }
        return result;
    }

    function mirrorPose(pose) {
        function mx(p) { return {x: 1 - p.x, y: p.y}; }
        return {
            head: mx(pose.head), neck: mx(pose.neck),
            shoulderL: mx(pose.shoulderR), shoulderR: mx(pose.shoulderL),
            elbowL: mx(pose.elbowR), elbowR: mx(pose.elbowL),
            wristL: mx(pose.wristR), wristR: mx(pose.wristL),
            hip: mx(pose.hip),
            kneeL: mx(pose.kneeR), kneeR: mx(pose.kneeL),
            ankleL: mx(pose.ankleR), ankleR: mx(pose.ankleL)
        };
    }

    // =========================================================================
    // 14 Meridians + Acupoints
    // =========================================================================

    var MERIDIANS = [
        // LU - Lung
        {
            id:'LU', name:'手太阴肺经', shortName:'肺经', englishName:'Lung Meridian',
            organ:'肺', element:'metal', yinYang:'yin', limbType:'hand',
            direction:'centrifugal', color:'#94a3b8',
            pathFront:[
                {x:0.38,y:0.22},{x:0.37,y:0.235},{x:0.36,y:0.25},{x:0.35,y:0.27},
                {x:0.34,y:0.285},{x:0.33,y:0.30},{x:0.32,y:0.315},{x:0.31,y:0.33},
                {x:0.30,y:0.345},{x:0.29,y:0.36},{x:0.28,y:0.38},{x:0.27,y:0.395},
                {x:0.26,y:0.41},{x:0.25,y:0.425},{x:0.24,y:0.44},{x:0.235,y:0.45},
                {x:0.23,y:0.46},{x:0.225,y:0.47},{x:0.22,y:0.48}
            ],
            pathBack:[],
            acupoints:[
                {id:'LU-1',name:'中府',pinyin:'Zhōng Fǔ',positionFront:{x:0.38,y:0.22},isKey:true,
                 functions:['宣肺理气','止咳平喘','肃降肺气'],indication:'咳嗽、气喘、胸闷、胸痛、肩背痛'},
                {id:'LU-5',name:'尺泽',pinyin:'Chǐ Zé',positionFront:{x:0.28,y:0.38},isKey:true,
                 functions:['清肺泻火','降逆止咳','舒筋活络'],indication:'咳嗽、气喘、咯血、潮热、肘臂挛痛'},
                {id:'LU-7',name:'列缺',pinyin:'Liè Quē',positionFront:{x:0.25,y:0.44},isKey:true,
                 functions:['宣肺解表','通经活络','通调任脉'],indication:'头痛、项强、咳嗽、气喘、咽喉肿痛、口眼歪斜'},
                {id:'LU-9',name:'太渊',pinyin:'Tài Yuān',positionFront:{x:0.24,y:0.46},isKey:true,
                 functions:['补肺益气','止咳化痰','通调血脉'],indication:'咳嗽、气喘、无脉症、腕痛'},
                {id:'LU-11',name:'少商',pinyin:'Shào Shāng',positionFront:{x:0.22,y:0.48},isKey:true,
                 functions:['清热利咽','开窍醒神','泻肺热'],indication:'咽喉肿痛、鼻衄、高热、昏迷、癫狂'}
            ],
            description:'肺经起于中焦，下络大肠，上行穿膈属肺，循上肢内侧前缘至拇指端。主治咳嗽、气喘、胸闷、咽喉肿痛等肺系病证。'
        },
        // LI - Large Intestine
        {
            id:'LI', name:'手阳明大肠经', shortName:'大肠经', englishName:'Large Intestine Meridian',
            organ:'大肠', element:'metal', yinYang:'yang', limbType:'hand',
            direction:'centripetal', color:'#cbd5e1',
            pathFront:[
                {x:0.21,y:0.48},{x:0.215,y:0.47},{x:0.22,y:0.46},{x:0.225,y:0.45},
                {x:0.23,y:0.44},{x:0.24,y:0.425},{x:0.25,y:0.41},{x:0.26,y:0.395},
                {x:0.27,y:0.38},{x:0.28,y:0.365},{x:0.285,y:0.35},{x:0.29,y:0.335},
                {x:0.30,y:0.32},{x:0.31,y:0.30},{x:0.32,y:0.28},{x:0.33,y:0.26},
                {x:0.35,y:0.24},{x:0.37,y:0.22},{x:0.39,y:0.20},{x:0.40,y:0.185},
                {x:0.41,y:0.17},{x:0.43,y:0.155},{x:0.44,y:0.14},{x:0.455,y:0.125},
                {x:0.46,y:0.115},{x:0.47,y:0.105},{x:0.48,y:0.10}
            ],
            pathBack:[],
            acupoints:[
                {id:'LI-4',name:'合谷',pinyin:'Hé Gǔ',positionFront:{x:0.23,y:0.44},isKey:true,
                 functions:['疏风解表','通络镇痛','清泄肺气'],indication:'头痛、目赤肿痛、鼻衄、齿痛、面肿、发热恶寒'},
                {id:'LI-11',name:'曲池',pinyin:'Qū Chí',positionFront:{x:0.285,y:0.35},isKey:true,
                 functions:['清热解表','疏经通络','调和气血'],indication:'热病、上肢不遂、手臂肿痛、高血压'},
                {id:'LI-20',name:'迎香',pinyin:'Yíng Xiāng',positionFront:{x:0.48,y:0.10},isKey:true,
                 functions:['祛风通窍','理气止痛'],indication:'鼻塞、鼻衄、口眼歪斜、面痒浮肿'}
            ],
            description:'大肠经起于食指末端，经手背沿前臂外侧上行至肩、颈，止于对侧鼻翼旁。主治头面五官疾患、热病及上肢外侧前缘痛。'
        },
        // ST - Stomach
        {
            id:'ST', name:'足阳明胃经', shortName:'胃经', englishName:'Stomach Meridian',
            organ:'胃', element:'earth', yinYang:'yang', limbType:'foot',
            direction:'centrifugal', color:'#fbbf24',
            pathFront:[
                {x:0.47,y:0.07},{x:0.47,y:0.08},{x:0.47,y:0.09},{x:0.47,y:0.10},
                {x:0.47,y:0.11},{x:0.47,y:0.12},{x:0.46,y:0.14},{x:0.46,y:0.16},
                {x:0.45,y:0.18},{x:0.44,y:0.20},{x:0.44,y:0.24},{x:0.44,y:0.28},
                {x:0.44,y:0.32},{x:0.44,y:0.36},{x:0.44,y:0.40},{x:0.44,y:0.44},
                {x:0.44,y:0.46},{x:0.43,y:0.50},{x:0.42,y:0.54},{x:0.41,y:0.58},
                {x:0.41,y:0.60},{x:0.41,y:0.62},{x:0.41,y:0.65},{x:0.40,y:0.68},
                {x:0.40,y:0.70},{x:0.40,y:0.73},{x:0.40,y:0.76},{x:0.40,y:0.79},
                {x:0.40,y:0.82},{x:0.41,y:0.85},{x:0.42,y:0.88},{x:0.42,y:0.90},
                {x:0.43,y:0.92},{x:0.44,y:0.94},{x:0.44,y:0.96}
            ],
            pathBack:[],
            acupoints:[
                {id:'ST-25',name:'天枢',pinyin:'Tiān Shū',positionFront:{x:0.44,y:0.44},isKey:true,
                 functions:['调肠胃','理气行滞','消食化积'],indication:'腹胀、肠鸣、泄泻、便秘、痢疾、月经不调'},
                {id:'ST-36',name:'足三里',pinyin:'Zú Sān Lǐ',positionFront:{x:0.41,y:0.70},isKey:true,
                 functions:['健脾和胃','扶正培元','通经活络'],indication:'胃痛、腹胀、呕吐、泄泻、下肢不遂、虚劳赢瘦'},
                {id:'ST-40',name:'丰隆',pinyin:'Fēng Lóng',positionFront:{x:0.40,y:0.76},isKey:true,
                 functions:['健脾化痰','和胃降逆','开窍'],indication:'头痛眩晕、咳嗽痰多、癫狂、下肢痿痹'}
            ],
            description:'胃经从眼下起，沿面颊、颈前、胸腹下行至下肢前侧，止于第二趾端。为多气多血之经，主治胃肠病、头面口齿病。'
        },
        // SP - Spleen
        {
            id:'SP', name:'足太阴脾经', shortName:'脾经', englishName:'Spleen Meridian',
            organ:'脾', element:'earth', yinYang:'yin', limbType:'foot',
            direction:'centripetal', color:'#f59e0b',
            pathFront:[
                {x:0.42,y:0.96},{x:0.42,y:0.94},{x:0.42,y:0.92},{x:0.43,y:0.90},
                {x:0.44,y:0.88},{x:0.44,y:0.86},{x:0.45,y:0.84},{x:0.45,y:0.82},
                {x:0.45,y:0.79},{x:0.45,y:0.76},{x:0.46,y:0.73},{x:0.46,y:0.70},
                {x:0.46,y:0.67},{x:0.46,y:0.64},{x:0.47,y:0.61},{x:0.47,y:0.58},
                {x:0.47,y:0.55},{x:0.47,y:0.52},{x:0.47,y:0.48},{x:0.47,y:0.44},
                {x:0.46,y:0.40},{x:0.46,y:0.36},{x:0.45,y:0.32},{x:0.44,y:0.28},
                {x:0.42,y:0.26},{x:0.40,y:0.24}
            ],
            pathBack:[],
            acupoints:[
                {id:'SP-6',name:'三阴交',pinyin:'Sān Yīn Jiāo',positionFront:{x:0.45,y:0.84},isKey:true,
                 functions:['健脾利湿','调补肝肾','行气活血'],indication:'肠鸣腹胀、泄泻、月经不调、带下、不孕、遗精'},
                {id:'SP-9',name:'阴陵泉',pinyin:'Yīn Líng Quán',positionFront:{x:0.46,y:0.70},isKey:true,
                 functions:['健脾利湿','通利小便'],indication:'腹胀、泄泻、水肿、黄疸、小便不利、膝痛'},
                {id:'SP-10',name:'血海',pinyin:'Xuè Hǎi',positionFront:{x:0.46,y:0.64},isKey:true,
                 functions:['活血化瘀','调经统血','健脾利湿'],indication:'月经不调、痛经、闭经、崩漏、瘾疹湿疹'}
            ],
            description:'脾经从大趾内侧起，沿下肢内侧上行至腹、胸。主治脾胃病、妇科病。脾为后天之本，气血生化之源。'
        },
        // HT - Heart
        {
            id:'HT', name:'手少阴心经', shortName:'心经', englishName:'Heart Meridian',
            organ:'心', element:'fire', yinYang:'yin', limbType:'hand',
            direction:'centrifugal', color:'#ef4444',
            pathFront:[
                {x:0.35,y:0.24},{x:0.34,y:0.26},{x:0.33,y:0.28},{x:0.32,y:0.295},
                {x:0.31,y:0.31},{x:0.30,y:0.325},{x:0.29,y:0.34},{x:0.28,y:0.355},
                {x:0.275,y:0.37},{x:0.27,y:0.385},{x:0.265,y:0.40},{x:0.26,y:0.415},
                {x:0.255,y:0.43},{x:0.25,y:0.44},{x:0.245,y:0.45},{x:0.24,y:0.46},
                {x:0.235,y:0.47},{x:0.22,y:0.48}
            ],
            pathBack:[],
            acupoints:[
                {id:'HT-3',name:'少海',pinyin:'Shào Hǎi',positionFront:{x:0.28,y:0.355},isKey:true,
                 functions:['理气通络','益心安神'],indication:'心痛、肘臂挛痛、头项痛、腋胁痛'},
                {id:'HT-7',name:'神门',pinyin:'Shén Mén',positionFront:{x:0.245,y:0.45},isKey:true,
                 functions:['宁心安神','通经活络'],indication:'心痛、心烦、惊悸、失眠、健忘、癫狂痫'},
                {id:'HT-9',name:'少冲',pinyin:'Shào Chōng',positionFront:{x:0.22,y:0.48},isKey:true,
                 functions:['清热熄风','醒神开窍'],indication:'心悸、心痛、胸胁痛、癫狂、热病、昏迷'}
            ],
            description:'心经从心系起，出于腋下，沿上臂内侧后缘下行至小指端。主治心、胸、神志病。心为君主之官。'
        },
        // SI - Small Intestine
        {
            id:'SI', name:'手太阳小肠经', shortName:'小肠经', englishName:'Small Intestine Meridian',
            organ:'小肠', element:'fire', yinYang:'yang', limbType:'hand',
            direction:'centripetal', color:'#f87171',
            pathFront:[
                {x:0.20,y:0.48},{x:0.205,y:0.47},{x:0.21,y:0.46},{x:0.215,y:0.45},
                {x:0.22,y:0.44},{x:0.225,y:0.43},{x:0.23,y:0.42},{x:0.235,y:0.41},
                {x:0.24,y:0.40},{x:0.25,y:0.39},{x:0.26,y:0.375},{x:0.27,y:0.36},
                {x:0.45,y:0.085}
            ],
            pathBack:[
                {x:0.27,y:0.36},{x:0.28,y:0.345},{x:0.29,y:0.33},{x:0.30,y:0.315},
                {x:0.31,y:0.30},{x:0.32,y:0.28},{x:0.33,y:0.26},{x:0.34,y:0.24},
                {x:0.35,y:0.22},{x:0.37,y:0.20},{x:0.38,y:0.19},{x:0.40,y:0.18},
                {x:0.42,y:0.16},{x:0.44,y:0.14},{x:0.46,y:0.12},{x:0.47,y:0.10}
            ],
            acupoints:[
                {id:'SI-3',name:'后溪',pinyin:'Hòu Xī',positionFront:{x:0.215,y:0.45},isKey:true,
                 functions:['清心安神','通经活络','通督脉'],indication:'头项强痛、腰背痛、手指挛痛、目赤、耳聋'},
                {id:'SI-19',name:'听宫',pinyin:'Tīng Gōng',positionFront:{x:0.45,y:0.085},isKey:true,
                 functions:['聪耳开窍','宁神定志'],indication:'耳鸣、耳聋、聤耳、齿痛、癫狂'}
            ],
            description:'小肠经从小指尺侧起，经手背、前臂外侧上行至肩后、颈侧，止于耳前。主治头面五官病、热病、神志病。'
        },
        // BL - Bladder
        {
            id:'BL', name:'足太阳膀胱经', shortName:'膀胱经', englishName:'Bladder Meridian',
            organ:'膀胱', element:'water', yinYang:'yang', limbType:'foot',
            direction:'centrifugal', color:'#1e3a5f',
            pathFront:[{x:0.48,y:0.065},{x:0.48,y:0.055},{x:0.48,y:0.045},{x:0.48,y:0.035}],
            pathBack:[
                {x:0.48,y:0.035},{x:0.48,y:0.025},{x:0.48,y:0.02},{x:0.47,y:0.04},
                {x:0.47,y:0.06},{x:0.47,y:0.08},{x:0.47,y:0.10},{x:0.47,y:0.12},
                {x:0.46,y:0.14},{x:0.46,y:0.17},{x:0.46,y:0.20},{x:0.46,y:0.23},
                {x:0.46,y:0.26},{x:0.46,y:0.29},{x:0.46,y:0.32},{x:0.46,y:0.35},
                {x:0.46,y:0.38},{x:0.46,y:0.41},{x:0.46,y:0.44},{x:0.45,y:0.47},
                {x:0.45,y:0.50},{x:0.44,y:0.53},{x:0.43,y:0.56},{x:0.42,y:0.59},
                {x:0.42,y:0.62},{x:0.42,y:0.65},{x:0.42,y:0.68},{x:0.42,y:0.71},
                {x:0.42,y:0.74},{x:0.42,y:0.77},{x:0.42,y:0.80},{x:0.42,y:0.83},
                {x:0.42,y:0.86},{x:0.43,y:0.88},{x:0.43,y:0.90},{x:0.44,y:0.92},
                {x:0.44,y:0.94},{x:0.44,y:0.96}
            ],
            acupoints:[
                {id:'BL-2',name:'攒竹',pinyin:'Cuán Zhú',positionFront:{x:0.48,y:0.055},isKey:true,
                 functions:['清热明目','祛风通络'],indication:'头痛、口眼歪斜、目赤肿痛、迎风流泪'},
                {id:'BL-23',name:'肾俞',pinyin:'Shèn Shù',positionBack:{x:0.46,y:0.35},isKey:true,
                 functions:['补肾益气','强腰壮骨','利水'],indication:'腰痛、遗精、阳痿、遗尿、月经不调、耳鸣'},
                {id:'BL-40',name:'委中',pinyin:'Wěi Zhōng',positionBack:{x:0.42,y:0.65},isKey:true,
                 functions:['舒筋通络','散瘀活血','清热解毒'],indication:'腰背疼痛、下肢痿痹、腹痛吐泻'},
                {id:'BL-60',name:'昆仑',pinyin:'Kūn Lún',positionBack:{x:0.43,y:0.90},isKey:true,
                 functions:['舒筋活络','散风清热','强腰膝'],indication:'头痛、项强、目眩、腰骶疼痛、足踝肿痛'},
                {id:'BL-67',name:'至阴',pinyin:'Zhì Yīn',positionBack:{x:0.44,y:0.96},isKey:true,
                 functions:['正胎催产','清头明目','通经活络'],indication:'头痛、目痛、鼻塞、鼻衄、胎位不正'}
            ],
            description:'膀胱经为人体最长经脉，从内眼角起经头顶至颈后，沿脊柱两旁下行至足小趾。'
        },
        // KI - Kidney
        {
            id:'KI', name:'足少阴肾经', shortName:'肾经', englishName:'Kidney Meridian',
            organ:'肾', element:'water', yinYang:'yin', limbType:'foot',
            direction:'centripetal', color:'#334155',
            pathFront:[
                {x:0.44,y:0.96},{x:0.44,y:0.94},{x:0.45,y:0.92},{x:0.45,y:0.90},
                {x:0.46,y:0.88},{x:0.46,y:0.86},{x:0.46,y:0.83},{x:0.46,y:0.80},
                {x:0.46,y:0.77},{x:0.46,y:0.74},{x:0.46,y:0.71},{x:0.47,y:0.68},
                {x:0.47,y:0.65},{x:0.47,y:0.62},{x:0.48,y:0.58},{x:0.48,y:0.54},
                {x:0.48,y:0.50},{x:0.48,y:0.46},{x:0.48,y:0.42},{x:0.48,y:0.38},
                {x:0.48,y:0.34},{x:0.48,y:0.30},{x:0.47,y:0.26},{x:0.46,y:0.22}
            ],
            pathBack:[],
            acupoints:[
                {id:'KI-1',name:'涌泉',pinyin:'Yǒng Quán',positionFront:{x:0.44,y:0.96},isKey:true,
                 functions:['苏厥开窍','滋阴降火','镇静安神'],indication:'头顶痛、头晕、失音、小儿惊风、癫狂'},
                {id:'KI-3',name:'太溪',pinyin:'Tài Xī',positionFront:{x:0.45,y:0.90},isKey:true,
                 functions:['补肾益阴','壮阳强腰','清虚热'],indication:'耳鸣、耳聋、咽喉肿痛、齿痛、失眠、阳痿'},
                {id:'KI-6',name:'照海',pinyin:'Zhào Hǎi',positionFront:{x:0.46,y:0.88},isKey:true,
                 functions:['滋阴清热','调经止带','宁神定志'],indication:'咽喉干痛、目赤肿痛、月经不调、失眠'}
            ],
            description:'肾经从足底起，沿下肢内侧后缘上行至腹、胸。肾为先天之本，主藏精、主水、主纳气。'
        },
        // PC - Pericardium
        {
            id:'PC', name:'手厥阴心包经', shortName:'心包经', englishName:'Pericardium Meridian',
            organ:'心包', element:'fire', yinYang:'yin', limbType:'hand',
            direction:'centrifugal', color:'#dc2626',
            pathFront:[
                {x:0.37,y:0.23},{x:0.36,y:0.245},{x:0.35,y:0.26},{x:0.34,y:0.275},
                {x:0.33,y:0.29},{x:0.32,y:0.305},{x:0.31,y:0.32},{x:0.30,y:0.335},
                {x:0.29,y:0.35},{x:0.28,y:0.365},{x:0.275,y:0.38},{x:0.27,y:0.39},
                {x:0.26,y:0.405},{x:0.25,y:0.42},{x:0.24,y:0.435},{x:0.235,y:0.445},
                {x:0.23,y:0.455},{x:0.225,y:0.465},{x:0.22,y:0.48}
            ],
            pathBack:[],
            acupoints:[
                {id:'PC-6',name:'内关',pinyin:'Nèi Guān',positionFront:{x:0.25,y:0.42},isKey:true,
                 functions:['宁心安神','理气止痛','和胃降逆'],indication:'心痛、心悸、胸闷、胃痛、呕吐、眩晕、失眠'},
                {id:'PC-8',name:'劳宫',pinyin:'Láo Gōng',positionFront:{x:0.23,y:0.455},isKey:true,
                 functions:['清心泻热','开窍醒神','消肿止痒'],indication:'心痛、癫狂、口疮、口臭、中风昏迷'},
                {id:'PC-9',name:'中冲',pinyin:'Zhōng Chōng',positionFront:{x:0.22,y:0.48},isKey:true,
                 functions:['清心泻热','开窍醒神'],indication:'心痛、昏迷、舌强肿痛、热病、中暑'}
            ],
            description:'心包经从胸中起，沿上臂内侧中线下行至中指端。心包代心受邪，主治心胸病、胃病、神志病。'
        },
        // SJ - Triple Burner
        {
            id:'SJ', name:'手少阳三焦经', shortName:'三焦经', englishName:'Triple Burner Meridian',
            organ:'三焦', element:'fire', yinYang:'yang', limbType:'hand',
            direction:'centripetal', color:'#fb923c',
            pathFront:[
                {x:0.20,y:0.48},{x:0.205,y:0.47},{x:0.21,y:0.46},{x:0.22,y:0.45},
                {x:0.225,y:0.44},{x:0.46,y:0.065}
            ],
            pathBack:[
                {x:0.225,y:0.44},{x:0.23,y:0.43},{x:0.235,y:0.42},{x:0.24,y:0.41},
                {x:0.25,y:0.395},{x:0.26,y:0.38},{x:0.27,y:0.365},{x:0.28,y:0.35},
                {x:0.285,y:0.34},{x:0.29,y:0.33},{x:0.30,y:0.31},{x:0.31,y:0.295},
                {x:0.32,y:0.28},{x:0.33,y:0.26},{x:0.34,y:0.24},{x:0.36,y:0.22},
                {x:0.38,y:0.20},{x:0.40,y:0.185},{x:0.42,y:0.17},{x:0.44,y:0.15},
                {x:0.45,y:0.13},{x:0.46,y:0.11},{x:0.47,y:0.09},{x:0.47,y:0.075}
            ],
            acupoints:[
                {id:'SJ-5',name:'外关',pinyin:'Wài Guān',positionFront:{x:0.225,y:0.44},isKey:true,
                 functions:['清热解表','通经活络','疏散风热'],indication:'热病、头痛、目赤肿痛、耳鸣耳聋、上肢痹痛'},
                {id:'SJ-17',name:'翳风',pinyin:'Yì Fēng',positionBack:{x:0.44,y:0.11},isKey:true,
                 functions:['聪耳通窍','散风泻热'],indication:'耳鸣、耳聋、口眼歪斜、面痛、牙关紧闭'},
                {id:'SJ-23',name:'丝竹空',pinyin:'Sī Zhú Kōng',positionFront:{x:0.46,y:0.065},isKey:true,
                 functions:['清头明目','散骨镇惊'],indication:'头痛、目眩、目赤肿痛、眼睑瞤动、齿痛'}
            ],
            description:'三焦经从无名指端起，经手背、前臂背面上行至肩、颈后、耳后，止于眉梢。三焦主通调水道。'
        },
        // GB - Gallbladder
        {
            id:'GB', name:'足少阳胆经', shortName:'胆经', englishName:'Gallbladder Meridian',
            organ:'胆', element:'wood', yinYang:'yang', limbType:'foot',
            direction:'centrifugal', color:'#4ade80',
            pathFront:[
                {x:0.46,y:0.065},{x:0.45,y:0.055},{x:0.44,y:0.045},{x:0.43,y:0.04},
                {x:0.42,y:0.05},{x:0.41,y:0.06},{x:0.40,y:0.055},{x:0.39,y:0.045},
                {x:0.40,y:0.06},{x:0.41,y:0.075},{x:0.42,y:0.085}
            ],
            pathBack:[
                {x:0.42,y:0.085},{x:0.43,y:0.095},{x:0.43,y:0.11},{x:0.42,y:0.13},
                {x:0.40,y:0.15},{x:0.38,y:0.17},{x:0.37,y:0.19},{x:0.36,y:0.21},
                {x:0.38,y:0.22},{x:0.39,y:0.24},{x:0.39,y:0.27},{x:0.39,y:0.30},
                {x:0.38,y:0.33},{x:0.38,y:0.36},{x:0.37,y:0.39},{x:0.37,y:0.42},
                {x:0.37,y:0.45},{x:0.37,y:0.48},{x:0.38,y:0.51},{x:0.38,y:0.54},
                {x:0.38,y:0.57},{x:0.38,y:0.60},{x:0.38,y:0.63},{x:0.38,y:0.66},
                {x:0.38,y:0.69},{x:0.38,y:0.72},{x:0.38,y:0.75},{x:0.38,y:0.78},
                {x:0.39,y:0.81},{x:0.39,y:0.84},{x:0.40,y:0.87},{x:0.41,y:0.89},
                {x:0.42,y:0.91},{x:0.42,y:0.93},{x:0.43,y:0.95}
            ],
            acupoints:[
                {id:'GB-20',name:'风池',pinyin:'Fēng Chí',positionBack:{x:0.43,y:0.095},isKey:true,
                 functions:['疏风清热','明目益聪','通利官窍'],indication:'头痛、眩晕、目赤肿痛、鼻渊、耳鸣、感冒'},
                {id:'GB-21',name:'肩井',pinyin:'Jiān Jǐng',positionBack:{x:0.40,y:0.15},isKey:true,
                 functions:['祛风活络','消肿散结'],indication:'肩背痹痛、上肢不遂、颈项强痛、乳痈'},
                {id:'GB-30',name:'环跳',pinyin:'Huán Tiào',positionBack:{x:0.38,y:0.51},isKey:true,
                 functions:['祛风化湿','强健腰膝','通经活络'],indication:'腰腿疼痛、下肢痿痹、半身不遂'},
                {id:'GB-34',name:'阳陵泉',pinyin:'Yáng Líng Quán',positionBack:{x:0.38,y:0.66},isKey:true,
                 functions:['舒筋活络','清利肝胆','强健腰膝'],indication:'下肢痿痹、膝肿痛、胁肋痛、口苦'}
            ],
            description:'胆经从外眼角起，经头侧、颈侧、肩部至胁肋，沿下肢外侧下行至第四趾端。胆主决断。'
        },
        // LR - Liver
        {
            id:'LR', name:'足厥阴肝经', shortName:'肝经', englishName:'Liver Meridian',
            organ:'肝', element:'wood', yinYang:'yin', limbType:'foot',
            direction:'centripetal', color:'#22c55e',
            pathFront:[
                {x:0.42,y:0.96},{x:0.42,y:0.94},{x:0.43,y:0.92},{x:0.43,y:0.90},
                {x:0.44,y:0.88},{x:0.44,y:0.86},{x:0.45,y:0.83},{x:0.45,y:0.80},
                {x:0.46,y:0.77},{x:0.46,y:0.74},{x:0.46,y:0.71},{x:0.47,y:0.68},
                {x:0.47,y:0.65},{x:0.47,y:0.62},{x:0.47,y:0.59},{x:0.48,y:0.56},
                {x:0.48,y:0.53},{x:0.48,y:0.50},{x:0.48,y:0.47},{x:0.47,y:0.44},
                {x:0.46,y:0.40},{x:0.44,y:0.36},{x:0.43,y:0.32},{x:0.42,y:0.28},
                {x:0.41,y:0.25}
            ],
            pathBack:[],
            acupoints:[
                {id:'LR-3',name:'太冲',pinyin:'Tài Chōng',positionFront:{x:0.43,y:0.92},isKey:true,
                 functions:['疏肝理气','平肝熄风','清头目'],indication:'头痛、眩晕、目赤肿痛、口歪、胁痛、月经不调'},
                {id:'LR-8',name:'曲泉',pinyin:'Qū Quán',positionFront:{x:0.47,y:0.65},isKey:true,
                 functions:['清利湿热','舒筋活络'],indication:'月经不调、带下、遗精、阳痿、膝痛、小便不利'},
                {id:'LR-14',name:'期门',pinyin:'Qī Mén',positionFront:{x:0.41,y:0.25},isKey:true,
                 functions:['疏肝理气','健脾和胃','活血化瘀'],indication:'胸胁胀痛、呕吐、呃逆、吞酸、腹胀'}
            ],
            description:'肝经从大趾背起，沿下肢内侧中间上行至阴部、少腹、胁肋。肝主疏泄、藏血、主筋。'
        },
        // RN - Conception Vessel
        {
            id:'RN', name:'任脉', shortName:'任脉', englishName:'Conception Vessel',
            organ:'任脉', element:'water', yinYang:'yin', limbType:'trunk',
            direction:'centripetal', color:'#a855f7',
            pathFront:[
                {x:0.50,y:0.58},{x:0.50,y:0.56},{x:0.50,y:0.54},{x:0.50,y:0.52},
                {x:0.50,y:0.50},{x:0.50,y:0.48},{x:0.50,y:0.46},{x:0.50,y:0.44},
                {x:0.50,y:0.42},{x:0.50,y:0.40},{x:0.50,y:0.38},{x:0.50,y:0.36},
                {x:0.50,y:0.34},{x:0.50,y:0.32},{x:0.50,y:0.30},{x:0.50,y:0.28},
                {x:0.50,y:0.26},{x:0.50,y:0.24},{x:0.50,y:0.22},{x:0.50,y:0.20},
                {x:0.50,y:0.18},{x:0.50,y:0.16},{x:0.50,y:0.14},{x:0.50,y:0.12}
            ],
            pathBack:[],
            acupoints:[
                {id:'RN-4',name:'关元',pinyin:'Guān Yuán',positionFront:{x:0.50,y:0.52},isKey:true,
                 functions:['培元固本','补益下焦','回阳救逆'],indication:'虚劳赢瘦、中风脱证、遗尿、遗精、月经不调'},
                {id:'RN-6',name:'气海',pinyin:'Qì Hǎi',positionFront:{x:0.50,y:0.50},isKey:true,
                 functions:['补气益元','温阳固脱'],indication:'虚脱、腹痛、泄泻、遗尿、遗精、月经不调'},
                {id:'RN-12',name:'中脘',pinyin:'Zhōng Wǎn',positionFront:{x:0.50,y:0.40},isKey:true,
                 functions:['和胃健脾','降逆利水'],indication:'胃痛、腹胀、呕吐、吞酸、泄泻、黄疸'},
                {id:'RN-17',name:'膻中',pinyin:'Dàn Zhōng',positionFront:{x:0.50,y:0.28},isKey:true,
                 functions:['宽胸理气','降逆止呕','宣肺化痰'],indication:'咳嗽、气喘、胸闷、胸痛、心悸、产妇乳少'}
            ],
            description:'任脉起于会阴，沿腹胸正中线上行至下颌。任脉为"阴脉之海"，总任一身之阴经。'
        },
        // DU - Governing Vessel
        {
            id:'DU', name:'督脉', shortName:'督脉', englishName:'Governing Vessel',
            organ:'督脉', element:'fire', yinYang:'yang', limbType:'trunk',
            direction:'centripetal', color:'#3b82f6',
            pathFront:[
                {x:0.50,y:0.04},{x:0.50,y:0.05},{x:0.50,y:0.06},{x:0.50,y:0.07},
                {x:0.50,y:0.08},{x:0.50,y:0.09},{x:0.50,y:0.10}
            ],
            pathBack:[
                {x:0.50,y:0.55},{x:0.50,y:0.53},{x:0.50,y:0.51},{x:0.50,y:0.49},
                {x:0.50,y:0.47},{x:0.50,y:0.45},{x:0.50,y:0.43},{x:0.50,y:0.41},
                {x:0.50,y:0.39},{x:0.50,y:0.37},{x:0.50,y:0.35},{x:0.50,y:0.33},
                {x:0.50,y:0.31},{x:0.50,y:0.29},{x:0.50,y:0.27},{x:0.50,y:0.25},
                {x:0.50,y:0.23},{x:0.50,y:0.21},{x:0.50,y:0.19},{x:0.50,y:0.17},
                {x:0.50,y:0.15},{x:0.50,y:0.13},{x:0.50,y:0.11},{x:0.50,y:0.09},
                {x:0.50,y:0.07},{x:0.50,y:0.05},{x:0.50,y:0.04}
            ],
            acupoints:[
                {id:'DU-4',name:'命门',pinyin:'Mìng Mén',positionBack:{x:0.50,y:0.37},isKey:true,
                 functions:['补肾壮阳','强腰膝','固精止带'],indication:'腰脊强痛、遗精、阳痿、带下、月经不调'},
                {id:'DU-14',name:'大椎',pinyin:'Dà Zhuī',positionBack:{x:0.50,y:0.17},isKey:true,
                 functions:['清热解表','截疟止痫','益气壮阳'],indication:'热病、疟疾、感冒、咳嗽、气喘、项强'},
                {id:'DU-20',name:'百会',pinyin:'Bǎi Huì',positionBack:{x:0.50,y:0.02},positionFront:{x:0.50,y:0.02},isKey:true,
                 functions:['开窍醒脑','升阳固脱','平肝熄风'],indication:'头痛、眩晕、中风不语、脱肛、癫狂、失眠'},
                {id:'DU-26',name:'人中',pinyin:'Rén Zhōng',positionFront:{x:0.50,y:0.10},isKey:true,
                 functions:['醒神开窍','清热熄风','解痉止痛'],indication:'昏迷、晕厥、中暑、中风、癫狂痫'}
            ],
            description:'督脉起于尾骨，沿脊柱正中上行过头顶至上唇。督脉为"阳脉之海"，总督一身之阳经。'
        }
    ];

    // =========================================================================
    // Baduanjin — 8 exercises + prep + closing
    // =========================================================================

    var BDJ_STANDING = {
        head:{x:0.50,y:0.06}, neck:{x:0.50,y:0.12},
        shoulderL:{x:0.38,y:0.18}, shoulderR:{x:0.62,y:0.18},
        elbowL:{x:0.34,y:0.30}, elbowR:{x:0.66,y:0.30},
        wristL:{x:0.30,y:0.42}, wristR:{x:0.70,y:0.42},
        hip:{x:0.50,y:0.46},
        kneeL:{x:0.44,y:0.66}, kneeR:{x:0.56,y:0.66},
        ankleL:{x:0.43,y:0.88}, ankleR:{x:0.57,y:0.88}
    };

    function cp(obj) {
        var r = {};
        for (var k in obj) r[k] = {x: obj[k].x, y: obj[k].y};
        return r;
    }

    var BADUANJIN = [
        // 预备式
        {
            id:'bdj-00', name:'预备式', category:'八段锦',
            description:'两脚开立，与肩同宽，两臂自然下垂，周身放松，呼吸自然。',
            benefits:['调整呼吸','放松身心','进入练功状态'],
            stimulatedMeridians:[],
            keyAcupoints:[],
            videoUrl:'/assets/videos/baduanjin/bdj-00-prep.mp4',
            keyframes:[
                {time:0, pose:cp(BDJ_STANDING), label:'预备式'},
                {time:1, pose:cp(BDJ_STANDING), label:'预备式'}
            ],
            duration:8
        },
        // 1. 双手托天理三焦
        {
            id:'bdj-01', name:'双手托天理三焦', category:'八段锦',
            description:'双手交叉上托，掌心朝天，全身充分伸展，调理三焦气机。吸气时上托，呼气时还原，动作缓慢均匀。',
            benefits:['疏通三焦经气','拉伸脊柱及两侧肌群','改善肩颈僵硬','调理气血运行'],
            stimulatedMeridians:[
                {meridianId:'SJ',intensity:'primary',note:'双手上托直接拉伸三焦经'},
                {meridianId:'LU',intensity:'primary',note:'扩胸展臂刺激肺经'},
                {meridianId:'PC',intensity:'primary',note:'手臂内侧伸展刺激心包经'},
                {meridianId:'DU',intensity:'secondary',note:'脊柱伸展间接刺激督脉'}
            ],
            keyAcupoints:['SJ-5','LU-1','PC-6','DU-20'],
            videoUrl:'/assets/videos/baduanjin/bdj-01.mp4',
            keyframes:[
                {time:0, pose:cp(BDJ_STANDING), label:'预备式'},
                {time:0.15, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.12},shoulderL:{x:0.38,y:0.18},shoulderR:{x:0.62,y:0.18},elbowL:{x:0.38,y:0.24},elbowR:{x:0.62,y:0.24},wristL:{x:0.46,y:0.30},wristR:{x:0.54,y:0.30},hip:{x:0.50,y:0.46},kneeL:{x:0.44,y:0.66},kneeR:{x:0.56,y:0.66},ankleL:{x:0.43,y:0.88},ankleR:{x:0.57,y:0.88}}, label:'双手交叉于腹前'},
                {time:0.35, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.12},shoulderL:{x:0.38,y:0.17},shoulderR:{x:0.62,y:0.17},elbowL:{x:0.40,y:0.14},elbowR:{x:0.60,y:0.14},wristL:{x:0.47,y:0.10},wristR:{x:0.53,y:0.10},hip:{x:0.50,y:0.46},kneeL:{x:0.44,y:0.66},kneeR:{x:0.56,y:0.66},ankleL:{x:0.43,y:0.88},ankleR:{x:0.57,y:0.88}}, label:'双手经胸前上举'},
                {time:0.55, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.11},shoulderL:{x:0.39,y:0.16},shoulderR:{x:0.61,y:0.16},elbowL:{x:0.42,y:0.08},elbowR:{x:0.58,y:0.08},wristL:{x:0.46,y:0.02},wristR:{x:0.54,y:0.02},hip:{x:0.50,y:0.46},kneeL:{x:0.44,y:0.66},kneeR:{x:0.56,y:0.66},ankleL:{x:0.43,y:0.88},ankleR:{x:0.57,y:0.88}}, label:'双手托天，掌心朝上'},
                {time:0.80, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.12},shoulderL:{x:0.38,y:0.17},shoulderR:{x:0.62,y:0.17},elbowL:{x:0.36,y:0.20},elbowR:{x:0.64,y:0.20},wristL:{x:0.32,y:0.30},wristR:{x:0.68,y:0.30},hip:{x:0.50,y:0.46},kneeL:{x:0.44,y:0.66},kneeR:{x:0.56,y:0.66},ankleL:{x:0.43,y:0.88},ankleR:{x:0.57,y:0.88}}, label:'双手体侧下落'},
                {time:1, pose:cp(BDJ_STANDING), label:'还原'}
            ],
            duration:12
        },
        // 2. 左右开弓似射雕
        {
            id:'bdj-02', name:'左右开弓似射雕', category:'八段锦',
            description:'两臂平展如拉弓射箭，马步站立，左右交替。扩胸展肩，锻炼上肢及胸背肌群，宣通肺气。',
            benefits:['扩展胸廓，宣发肺气','增强上肢及胸背肌力','改善呼吸功能','刺激心肺经络'],
            stimulatedMeridians:[
                {meridianId:'LU',intensity:'primary',note:'扩胸展臂拉伸肺经'},
                {meridianId:'LI',intensity:'primary',note:'手臂外展刺激大肠经'},
                {meridianId:'HT',intensity:'primary',note:'内侧手臂伸展刺激心经'},
                {meridianId:'PC',intensity:'secondary',note:'间接刺激心包经'}
            ],
            keyAcupoints:['LU-1','LI-4','HT-7','PC-6','LU-5'],
            videoUrl:'/assets/videos/baduanjin/bdj-02.mp4',
            keyframes:[
                {time:0, pose:cp(BDJ_STANDING), label:'预备式'},
                {time:0.15, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.12},shoulderL:{x:0.38,y:0.18},shoulderR:{x:0.62,y:0.18},elbowL:{x:0.42,y:0.22},elbowR:{x:0.58,y:0.22},wristL:{x:0.46,y:0.26},wristR:{x:0.54,y:0.26},hip:{x:0.50,y:0.48},kneeL:{x:0.40,y:0.66},kneeR:{x:0.60,y:0.66},ankleL:{x:0.40,y:0.88},ankleR:{x:0.60,y:0.88}}, label:'下蹲马步，双手抱于胸前'},
                {time:0.40, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.12},shoulderL:{x:0.36,y:0.18},shoulderR:{x:0.64,y:0.18},elbowL:{x:0.22,y:0.19},elbowR:{x:0.58,y:0.22},wristL:{x:0.12,y:0.18},wristR:{x:0.54,y:0.20},hip:{x:0.50,y:0.48},kneeL:{x:0.40,y:0.66},kneeR:{x:0.60,y:0.66},ankleL:{x:0.40,y:0.88},ankleR:{x:0.60,y:0.88}}, label:'左手推出如射箭，目视左手'},
                {time:0.55, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.12},shoulderL:{x:0.38,y:0.18},shoulderR:{x:0.62,y:0.18},elbowL:{x:0.42,y:0.22},elbowR:{x:0.58,y:0.22},wristL:{x:0.46,y:0.26},wristR:{x:0.54,y:0.26},hip:{x:0.50,y:0.48},kneeL:{x:0.40,y:0.66},kneeR:{x:0.60,y:0.66},ankleL:{x:0.40,y:0.88},ankleR:{x:0.60,y:0.88}}, label:'收回，双手抱于胸前'},
                {time:0.80, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.12},shoulderL:{x:0.36,y:0.18},shoulderR:{x:0.64,y:0.18},elbowL:{x:0.42,y:0.22},elbowR:{x:0.78,y:0.19},wristL:{x:0.46,y:0.20},wristR:{x:0.88,y:0.18},hip:{x:0.50,y:0.48},kneeL:{x:0.40,y:0.66},kneeR:{x:0.60,y:0.66},ankleL:{x:0.40,y:0.88},ankleR:{x:0.60,y:0.88}}, label:'右手推出如射箭，目视右手'},
                {time:1, pose:cp(BDJ_STANDING), label:'还原'}
            ],
            duration:12
        },
        // 3. 调理脾胃须单举
        {
            id:'bdj-03', name:'调理脾胃须单举', category:'八段锦',
            description:'一手上撑，一手下按，上下对拉拔伸脊柱，左右交替。牵拉腹腔对脾胃进行按摩，促进消化。',
            benefits:['调理脾胃升降气机','拉伸腹部及体侧肌群','改善消化功能','增强脊柱柔韧性'],
            stimulatedMeridians:[
                {meridianId:'SP',intensity:'primary',note:'拉伸体侧直接刺激脾经'},
                {meridianId:'ST',intensity:'primary',note:'腹部牵拉刺激胃经'},
                {meridianId:'LR',intensity:'secondary',note:'体侧伸展间接刺激肝经'},
                {meridianId:'GB',intensity:'secondary',note:'侧屈动作间接刺激胆经'}
            ],
            keyAcupoints:['SP-6','ST-36','RN-12','LR-3'],
            videoUrl:'/assets/videos/baduanjin/bdj-03.mp4',
            keyframes:[
                {time:0, pose:cp(BDJ_STANDING), label:'预备式'},
                {time:0.20, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.12},shoulderL:{x:0.38,y:0.17},shoulderR:{x:0.62,y:0.18},elbowL:{x:0.40,y:0.08},elbowR:{x:0.66,y:0.30},wristL:{x:0.44,y:0.02},wristR:{x:0.68,y:0.44},hip:{x:0.50,y:0.46},kneeL:{x:0.44,y:0.66},kneeR:{x:0.56,y:0.66},ankleL:{x:0.43,y:0.88},ankleR:{x:0.57,y:0.88}}, label:'左手上撑，右手下按'},
                {time:0.45, pose:cp(BDJ_STANDING), label:'双手还原'},
                {time:0.65, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.12},shoulderL:{x:0.38,y:0.18},shoulderR:{x:0.62,y:0.17},elbowL:{x:0.34,y:0.30},elbowR:{x:0.60,y:0.08},wristL:{x:0.32,y:0.44},wristR:{x:0.56,y:0.02},hip:{x:0.50,y:0.46},kneeL:{x:0.44,y:0.66},kneeR:{x:0.56,y:0.66},ankleL:{x:0.43,y:0.88},ankleR:{x:0.57,y:0.88}}, label:'右手上撑，左手下按'},
                {time:1, pose:cp(BDJ_STANDING), label:'还原'}
            ],
            duration:10
        },
        // 4. 五劳七伤往后瞧
        {
            id:'bdj-04', name:'五劳七伤往后瞧', category:'八段锦',
            description:'头部缓慢向后转动，目视斜后方，左右交替。通过颈部旋转刺激颈椎及背部经络，防治颈椎劳损。',
            benefits:['缓解颈椎疲劳','增强颈部灵活性','刺激背部督脉及膀胱经','改善头部血液循环'],
            stimulatedMeridians:[
                {meridianId:'BL',intensity:'primary',note:'颈部后转刺激膀胱经'},
                {meridianId:'SI',intensity:'primary',note:'颈肩旋转刺激小肠经'},
                {meridianId:'DU',intensity:'primary',note:'脊柱微旋刺激督脉'},
                {meridianId:'GB',intensity:'secondary',note:'头部侧转间接刺激胆经'}
            ],
            keyAcupoints:['DU-20','SI-3','GB-20','DU-14'],
            videoUrl:'/assets/videos/baduanjin/bdj-04.mp4',
            keyframes:[
                {time:0, pose:cp(BDJ_STANDING), label:'预备式'},
                {time:0.25, pose:{head:{x:0.46,y:0.06},neck:{x:0.49,y:0.12},shoulderL:{x:0.37,y:0.18},shoulderR:{x:0.63,y:0.18},elbowL:{x:0.34,y:0.30},elbowR:{x:0.66,y:0.30},wristL:{x:0.30,y:0.42},wristR:{x:0.70,y:0.42},hip:{x:0.50,y:0.46},kneeL:{x:0.44,y:0.66},kneeR:{x:0.56,y:0.66},ankleL:{x:0.43,y:0.88},ankleR:{x:0.57,y:0.88}}, label:'头向左后转，目视左斜后方'},
                {time:0.50, pose:cp(BDJ_STANDING), label:'头部回正'},
                {time:0.75, pose:{head:{x:0.54,y:0.06},neck:{x:0.51,y:0.12},shoulderL:{x:0.37,y:0.18},shoulderR:{x:0.63,y:0.18},elbowL:{x:0.34,y:0.30},elbowR:{x:0.66,y:0.30},wristL:{x:0.30,y:0.42},wristR:{x:0.70,y:0.42},hip:{x:0.50,y:0.46},kneeL:{x:0.44,y:0.66},kneeR:{x:0.56,y:0.66},ankleL:{x:0.43,y:0.88},ankleR:{x:0.57,y:0.88}}, label:'头向右后转，目视右斜后方'},
                {time:1, pose:cp(BDJ_STANDING), label:'还原'}
            ],
            duration:10
        },
        // 5. 摇头摆尾去心火
        {
            id:'bdj-05', name:'摇头摆尾去心火', category:'八段锦',
            description:'马步站立，俯身旋转摇头摆尾，左右交替。通过大幅度的脊柱扭转和头部摆动，泻心火，交心肾。',
            benefits:['清泻心火','交通心肾','增强腰腿力量','改善脊柱柔韧性'],
            stimulatedMeridians:[
                {meridianId:'HT',intensity:'primary',note:'摇头泻心火'},
                {meridianId:'KI',intensity:'primary',note:'摆尾强肾气'},
                {meridianId:'DU',intensity:'primary',note:'脊柱旋转刺激督脉'},
                {meridianId:'BL',intensity:'secondary',note:'俯身牵拉间接刺激膀胱经'}
            ],
            keyAcupoints:['HT-7','KI-1','DU-20','DU-4','BL-23'],
            videoUrl:'/assets/videos/baduanjin/bdj-05.mp4',
            keyframes:[
                {time:0, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.12},shoulderL:{x:0.38,y:0.18},shoulderR:{x:0.62,y:0.18},elbowL:{x:0.38,y:0.28},elbowR:{x:0.62,y:0.28},wristL:{x:0.40,y:0.40},wristR:{x:0.60,y:0.40},hip:{x:0.50,y:0.48},kneeL:{x:0.38,y:0.66},kneeR:{x:0.62,y:0.66},ankleL:{x:0.38,y:0.88},ankleR:{x:0.62,y:0.88}}, label:'马步站立，双手扶膝'},
                {time:0.20, pose:{head:{x:0.42,y:0.12},neck:{x:0.46,y:0.16},shoulderL:{x:0.36,y:0.22},shoulderR:{x:0.60,y:0.20},elbowL:{x:0.34,y:0.32},elbowR:{x:0.62,y:0.30},wristL:{x:0.38,y:0.42},wristR:{x:0.60,y:0.42},hip:{x:0.50,y:0.48},kneeL:{x:0.38,y:0.66},kneeR:{x:0.62,y:0.66},ankleL:{x:0.38,y:0.88},ankleR:{x:0.62,y:0.88}}, label:'向左摇头'},
                {time:0.40, pose:{head:{x:0.44,y:0.16},neck:{x:0.48,y:0.18},shoulderL:{x:0.38,y:0.24},shoulderR:{x:0.62,y:0.22},elbowL:{x:0.36,y:0.34},elbowR:{x:0.64,y:0.32},wristL:{x:0.38,y:0.44},wristR:{x:0.62,y:0.44},hip:{x:0.52,y:0.48},kneeL:{x:0.38,y:0.66},kneeR:{x:0.62,y:0.66},ankleL:{x:0.38,y:0.88},ankleR:{x:0.62,y:0.88}}, label:'左侧摆尾'},
                {time:0.55, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.12},shoulderL:{x:0.38,y:0.18},shoulderR:{x:0.62,y:0.18},elbowL:{x:0.38,y:0.28},elbowR:{x:0.62,y:0.28},wristL:{x:0.40,y:0.40},wristR:{x:0.60,y:0.40},hip:{x:0.50,y:0.48},kneeL:{x:0.38,y:0.66},kneeR:{x:0.62,y:0.66},ankleL:{x:0.38,y:0.88},ankleR:{x:0.62,y:0.88}}, label:'回正'},
                {time:0.75, pose:{head:{x:0.58,y:0.12},neck:{x:0.54,y:0.16},shoulderL:{x:0.40,y:0.20},shoulderR:{x:0.64,y:0.22},elbowL:{x:0.38,y:0.30},elbowR:{x:0.66,y:0.32},wristL:{x:0.40,y:0.42},wristR:{x:0.62,y:0.42},hip:{x:0.48,y:0.48},kneeL:{x:0.38,y:0.66},kneeR:{x:0.62,y:0.66},ankleL:{x:0.38,y:0.88},ankleR:{x:0.62,y:0.88}}, label:'向右摇头摆尾'},
                {time:1, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.12},shoulderL:{x:0.38,y:0.18},shoulderR:{x:0.62,y:0.18},elbowL:{x:0.38,y:0.28},elbowR:{x:0.62,y:0.28},wristL:{x:0.40,y:0.40},wristR:{x:0.60,y:0.40},hip:{x:0.50,y:0.48},kneeL:{x:0.38,y:0.66},kneeR:{x:0.62,y:0.66},ankleL:{x:0.38,y:0.88},ankleR:{x:0.62,y:0.88}}, label:'还原'}
            ],
            duration:15
        },
        // 6. 两手攀足固肾腰
        {
            id:'bdj-06', name:'两手攀足固肾腰', category:'八段锦',
            description:'双手沿腰背向下推按至足部，再沿腿后侧上行。前屈后仰交替，强化肾腰功能，疏通足太阳膀胱经。',
            benefits:['强腰固肾','疏通膀胱经','增强腰部柔韧性','改善肾功能'],
            stimulatedMeridians:[
                {meridianId:'KI',intensity:'primary',note:'前屈攀足直接刺激肾经'},
                {meridianId:'BL',intensity:'primary',note:'背部及腿后侧伸展刺激膀胱经'},
                {meridianId:'DU',intensity:'secondary',note:'脊柱前屈后仰间接刺激督脉'}
            ],
            keyAcupoints:['KI-1','BL-23','BL-40','DU-4'],
            videoUrl:'/assets/videos/baduanjin/bdj-06.mp4',
            keyframes:[
                {time:0, pose:cp(BDJ_STANDING), label:'预备式'},
                {time:0.20, pose:{head:{x:0.50,y:0.04},neck:{x:0.50,y:0.10},shoulderL:{x:0.38,y:0.16},shoulderR:{x:0.62,y:0.16},elbowL:{x:0.38,y:0.26},elbowR:{x:0.62,y:0.26},wristL:{x:0.40,y:0.36},wristR:{x:0.60,y:0.36},hip:{x:0.50,y:0.46},kneeL:{x:0.44,y:0.66},kneeR:{x:0.56,y:0.66},ankleL:{x:0.43,y:0.88},ankleR:{x:0.57,y:0.88}}, label:'双手后推腰部，微后仰'},
                {time:0.50, pose:{head:{x:0.50,y:0.34},neck:{x:0.50,y:0.30},shoulderL:{x:0.42,y:0.32},shoulderR:{x:0.58,y:0.32},elbowL:{x:0.42,y:0.46},elbowR:{x:0.58,y:0.46},wristL:{x:0.43,y:0.62},wristR:{x:0.57,y:0.62},hip:{x:0.50,y:0.46},kneeL:{x:0.44,y:0.66},kneeR:{x:0.56,y:0.66},ankleL:{x:0.43,y:0.88},ankleR:{x:0.57,y:0.88}}, label:'前屈俯身，双手沿腿下推'},
                {time:0.70, pose:{head:{x:0.50,y:0.50},neck:{x:0.50,y:0.45},shoulderL:{x:0.44,y:0.44},shoulderR:{x:0.56,y:0.44},elbowL:{x:0.43,y:0.60},elbowR:{x:0.57,y:0.60},wristL:{x:0.43,y:0.80},wristR:{x:0.57,y:0.80},hip:{x:0.50,y:0.46},kneeL:{x:0.44,y:0.66},kneeR:{x:0.56,y:0.66},ankleL:{x:0.43,y:0.88},ankleR:{x:0.57,y:0.88}}, label:'双手攀足，充分前屈'},
                {time:1, pose:cp(BDJ_STANDING), label:'缓慢起身还原'}
            ],
            duration:10
        },
        // 7. 攒拳怒目增气力
        {
            id:'bdj-07', name:'攒拳怒目增气力', category:'八段锦',
            description:'马步站立，双拳紧握置于腰侧，左右交替冲拳，怒目圆睁。激发肝气，增强气力。',
            benefits:['疏泄肝气','增强上肢力量','激发全身阳气','改善气血运行'],
            stimulatedMeridians:[
                {meridianId:'LR',intensity:'primary',note:'怒目瞪眼直接激发肝气'},
                {meridianId:'GB',intensity:'primary',note:'握拳冲拳刺激胆经'},
                {meridianId:'LI',intensity:'secondary',note:'冲拳运动间接刺激大肠经'},
                {meridianId:'ST',intensity:'secondary',note:'马步站立间接刺激胃经'}
            ],
            keyAcupoints:['LR-3','GB-34','LI-4','ST-36'],
            videoUrl:'/assets/videos/baduanjin/bdj-07.mp4',
            keyframes:[
                {time:0, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.12},shoulderL:{x:0.38,y:0.18},shoulderR:{x:0.62,y:0.18},elbowL:{x:0.34,y:0.28},elbowR:{x:0.66,y:0.28},wristL:{x:0.38,y:0.38},wristR:{x:0.62,y:0.38},hip:{x:0.50,y:0.48},kneeL:{x:0.38,y:0.66},kneeR:{x:0.62,y:0.66},ankleL:{x:0.38,y:0.88},ankleR:{x:0.62,y:0.88}}, label:'马步站立，双拳抱于腰侧'},
                {time:0.25, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.12},shoulderL:{x:0.36,y:0.18},shoulderR:{x:0.62,y:0.18},elbowL:{x:0.24,y:0.20},elbowR:{x:0.66,y:0.28},wristL:{x:0.12,y:0.20},wristR:{x:0.62,y:0.38},hip:{x:0.50,y:0.48},kneeL:{x:0.38,y:0.66},kneeR:{x:0.62,y:0.66},ankleL:{x:0.38,y:0.88},ankleR:{x:0.62,y:0.88}}, label:'左拳前冲，怒目圆睁'},
                {time:0.50, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.12},shoulderL:{x:0.38,y:0.18},shoulderR:{x:0.62,y:0.18},elbowL:{x:0.34,y:0.28},elbowR:{x:0.66,y:0.28},wristL:{x:0.38,y:0.38},wristR:{x:0.62,y:0.38},hip:{x:0.50,y:0.48},kneeL:{x:0.38,y:0.66},kneeR:{x:0.62,y:0.66},ankleL:{x:0.38,y:0.88},ankleR:{x:0.62,y:0.88}}, label:'收拳回腰侧'},
                {time:0.75, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.12},shoulderL:{x:0.38,y:0.18},shoulderR:{x:0.64,y:0.18},elbowL:{x:0.34,y:0.28},elbowR:{x:0.76,y:0.20},wristL:{x:0.38,y:0.38},wristR:{x:0.88,y:0.20},hip:{x:0.50,y:0.48},kneeL:{x:0.38,y:0.66},kneeR:{x:0.62,y:0.66},ankleL:{x:0.38,y:0.88},ankleR:{x:0.62,y:0.88}}, label:'右拳前冲，怒目圆睁'},
                {time:1, pose:{head:{x:0.50,y:0.06},neck:{x:0.50,y:0.12},shoulderL:{x:0.38,y:0.18},shoulderR:{x:0.62,y:0.18},elbowL:{x:0.34,y:0.28},elbowR:{x:0.66,y:0.28},wristL:{x:0.38,y:0.38},wristR:{x:0.62,y:0.38},hip:{x:0.50,y:0.48},kneeL:{x:0.38,y:0.66},kneeR:{x:0.62,y:0.66},ankleL:{x:0.38,y:0.88},ankleR:{x:0.62,y:0.88}}, label:'还原'}
            ],
            duration:10
        },
        // 8. 背后七颠百病消
        {
            id:'bdj-08', name:'背后七颠百病消', category:'八段锦',
            description:'双脚并立，提踵颠足，全身放松震动。通过脚跟有节奏的颠振刺激足底涌泉穴及足三阳经，调和全身气血。',
            benefits:['振奋全身阳气','刺激足底涌泉穴','改善全身血液循环','缓解疲劳'],
            stimulatedMeridians:[
                {meridianId:'KI',intensity:'primary',note:'颠足刺激足底涌泉穴（肾经起点）'},
                {meridianId:'BL',intensity:'primary',note:'提踵刺激膀胱经'},
                {meridianId:'ST',intensity:'primary',note:'足前部着力刺激胃经'},
                {meridianId:'DU',intensity:'secondary',note:'脊柱震动间接刺激督脉'},
                {meridianId:'SP',intensity:'secondary',note:'足部着力间接刺激脾经'}
            ],
            keyAcupoints:['KI-1','BL-67','ST-36','DU-20'],
            videoUrl:'/assets/videos/baduanjin/bdj-08.mp4',
            keyframes:[
                {time:0, pose:cp(BDJ_STANDING), label:'预备式，并步站立'},
                {time:0.20, pose:{head:{x:0.50,y:0.04},neck:{x:0.50,y:0.10},shoulderL:{x:0.38,y:0.16},shoulderR:{x:0.62,y:0.16},elbowL:{x:0.34,y:0.28},elbowR:{x:0.66,y:0.28},wristL:{x:0.30,y:0.40},wristR:{x:0.70,y:0.40},hip:{x:0.50,y:0.44},kneeL:{x:0.44,y:0.64},kneeR:{x:0.56,y:0.64},ankleL:{x:0.43,y:0.84},ankleR:{x:0.57,y:0.84}}, label:'提踵，全身上提'},
                {time:0.35, pose:cp(BDJ_STANDING), label:'脚跟落地，轻震'},
                {time:0.55, pose:{head:{x:0.50,y:0.04},neck:{x:0.50,y:0.10},shoulderL:{x:0.38,y:0.16},shoulderR:{x:0.62,y:0.16},elbowL:{x:0.34,y:0.28},elbowR:{x:0.66,y:0.28},wristL:{x:0.30,y:0.40},wristR:{x:0.70,y:0.40},hip:{x:0.50,y:0.44},kneeL:{x:0.44,y:0.64},kneeR:{x:0.56,y:0.64},ankleL:{x:0.43,y:0.84},ankleR:{x:0.57,y:0.84}}, label:'再次提踵'},
                {time:0.70, pose:cp(BDJ_STANDING), label:'脚跟落地，轻震'},
                {time:1, pose:cp(BDJ_STANDING), label:'还原收势'}
            ],
            duration:8
        },
        // 收势
        {
            id:'bdj-09', name:'收势', category:'八段锦',
            description:'两臂缓慢下落，呼吸自然，全身放松。',
            benefits:['收功养气','恢复平静','巩固练功效果'],
            stimulatedMeridians:[],
            keyAcupoints:[],
            videoUrl:'/assets/videos/baduanjin/bdj-09-closing.mp4',
            keyframes:[
                {time:0, pose:cp(BDJ_STANDING), label:'收势'},
                {time:1, pose:cp(BDJ_STANDING), label:'收势'}
            ],
            duration:8
        }
    ];

    // Helper: find meridian by ID
    function getMeridianById(id) {
        for (var i = 0; i < MERIDIANS.length; i++) {
            if (MERIDIANS[i].id === id) return MERIDIANS[i];
        }
        return null;
    }

    // Helper: find acupoint by ID across all meridians
    function getAcupointById(id) {
        for (var i = 0; i < MERIDIANS.length; i++) {
            var aps = MERIDIANS[i].acupoints;
            for (var j = 0; j < aps.length; j++) {
                if (aps[j].id === id) return { acupoint: aps[j], meridian: MERIDIANS[i] };
            }
        }
        return null;
    }

    return {
        BODY_OUTLINE: BODY_OUTLINE,
        STANDING_POSE: STANDING_POSE,
        JOINT_KEYS: JOINT_KEYS,
        MERIDIANS: MERIDIANS,
        BADUANJIN: BADUANJIN,
        lerpPose: lerpPose,
        mirrorPose: mirrorPose,
        getMeridianById: getMeridianById,
        getAcupointById: getAcupointById
    };
})();
