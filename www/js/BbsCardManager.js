/*
 * Copyright (c) 2013 Brain Book Software LLC
 * This software is licensed under the MIT license. A copy of the license
 * should have been included with this software.
*/
var BbsCardManager = 
{
	DB_VERSION: 1, // Increment each time words change

	curWord: null,
	db: null,
	PICK_WRONG_PERCENT: 0.15,
	dbInitialized: false,
	
	// ---

  initialize: function()
  {
  	// Prevent a swiping bug
		document.ontouchmove = function(event) {
		    event.preventDefault();
		};

		$(document).bind("pagechange", BbsCardManager.onPageChange);
		$(document).bind('pageinit', function() {
			if (!BbsCardManager.dbInitialized)
				BbsCardManager.initDb();
		});
		$(document).bind('swipeleft', function() {
			$.mobile.changePage($('#bck'), {transition: 'slide'});
		});
		$(document).bind('swiperight', function() {
			$.mobile.changePage($('#frnt'), {transition: 'slide', reverse: true});
		});
		$(document).bind('pagechange', function() {
			BbsCardManager.displayWord();
		});
  },

  initDb: function()
	{
		this.dbInitialized = true;
		this.openDb();
	},

	dbError: function(err)
	{
		console.log('SQL Error: ');
		console.log(err);
	},

	dropTbl: function(onResults)
	{
		this.db.transaction(function (tx) {
			tx.executeSql('DROP TABLE IF EXISTS words', null, onResults);
		}, this.dbError);
	},

	createTbl: function(tx, onResults)
	{
		tx.executeSql('DROP TABLE IF EXISTS words', null, function() {
			tx.executeSql('CREATE TABLE IF NOT EXISTS words (id unique, native_word, foreign_word, status, n_correct, n_wrong)', null, onResults);
		});
	},

	popTbl: function(create)
	{
		var ths = this;
		this.db.transaction(function (tx) {
			if (create) {
				ths.createTbl(tx, function() {
					ths.createOrUpdateWords();
				});
			} else {
				ths.createOrUpdateWords();
			}
		}, this.dbError);
	},

	createTblIfNotExists: function()
	{
		var ths = this;
		this.db.transaction(function (tx) {
			tx.executeSql('SELECT COUNT(*) FROM words', null, function (tx, results) {
				// tbl exists
				if (ths.db.version != ths.DB_VERSION) {
					ths.db.changeVersion(ths.db.version, ths.DB_VERSION, function(t) {
						ths.popTbl();
					});
				} else {
					ths.getUnreadWord();
				}
			}, function() {
				BbsCardManager.popTbl(true);
			});
		}, this.dbError);
	},
	
	openDb: function()
	{
		this.db = window.openDatabase('mydb', '', 'My DB', 200000);

		//this.dropTbl(this.createTblIfNotExists); return; // for debug

		this.createTblIfNotExists();
	},
	
	// ---
	
	goToFrntPage: function()
	{
		document.getElementById('frontWord').innerHTML = '';
		if ($.mobile.activePage.attr('id') == 'frnt') {
			this.displayWord();
		} else {
			$.mobile.changePage($('#frnt'));
		}
	},
	
	flip: function()
	{
		if ($.mobile.activePage.attr('id') == 'frnt') {
			$.mobile.changePage($('#bck'));
		} else {
			$.mobile.changePage($('#frnt'));
		}
	},
	
	displayWord: function()
	{
		if (!this.curWord)
			return;
		document.getElementById('frontWord').innerHTML = this.curWord.foreign_word;
		document.getElementById('backWord').innerHTML = this.curWord.native_word;
	},

	getUnreadWord: function()
	{
		this.db.transaction(function (tx) {
			tx.executeSql('SELECT COUNT(*) AS n FROM words WHERE status IS NULL', [], function (tx, results) {
				if (results.rows.item(0).n > 0) {
					// Randomly select an unread word
					var offset = Math.floor(Math.random()*results.rows.item(0).n);
					tx.executeSql('SELECT * FROM words WHERE status IS NULL LIMIT ' + offset + ',1', null, function (tx, results) {
						BbsCardManager.curWord = results.rows.item(0);
						BbsCardManager.goToFrntPage();
					}, this.dbError);
				} else {
					BbsCardManager.getWrongWord();
				}
			}, this.dbError);
		}, this.dbError);
	},
	
	getWrongWord: function()
	{
		this.db.transaction(function (tx) {
			tx.executeSql('SELECT COUNT(*) AS n FROM words WHERE status="Wrong"', [], function (tx, results) {
				if (results.rows.item(0).n > 0) { // Is there a wrong word?
					// Randomly select a word that was marked as wrong
					var offset = Math.floor(Math.random()*results.rows.item(0).n);
					tx.executeSql('SELECT * FROM words WHERE status="Wrong" LIMIT ' + offset + ',1', [], function (tx, results) {
						BbsCardManager.curWord = results.rows.item(0);
						BbsCardManager.goToFrntPage();
					}, this.dbError);
				} else {
					BbsCardManager.displayScore();
				}
			}, this.dbError);
		}, this.dbError);
	},
	
	createOrUpdateWords: function()
	{
		this.createOrUpdateNextWord(0);
	},

	createOrUpdateNextWord: function(i)
	{
		var ths = this;

		if (i == 1)
			this.getUnreadWord(); // Display after 1st word loaded
		else if (i >= BbsGermanWords.length) // All words loaded?
			return;

		this.db.transaction(function (tx) {
			tx.executeSql('INSERT INTO words (id, native_word, foreign_word, status, n_correct, n_wrong) VALUES (?, ?, ?, ?, ?, ?)',
				[BbsGermanWords[i][0], BbsGermanWords[i][1], BbsGermanWords[i][2], null, 0, 0], function() {
					ths.createOrUpdateNextWord(i + 1);
				});
		}, function() { // already exists?
			ths.db.transaction(function (tx) {
				tx.executeSql('UPDATE words SET native_word=?, foreign_word=? WHERE id=?',
					[BbsGermanWords[i][1], BbsGermanWords[i][2], BbsGermanWords[i][0]], function() {
					ths.createOrUpdateNextWord(i + 1);
				});			
			}, this.dbError);
		});
	},

	markAsCorrect: function()
	{
		this.db.transaction(function (tx) {
			tx.executeSql('UPDATE words SET status=?, n_correct=? WHERE id=?',
				['Correct', BbsCardManager.curWord.n_correct + 1, BbsCardManager.curWord.id]);
			BbsCardManager.getUnreadWord();
		}, this.dbError);
	},
	
	markAsWrong: function()
	{
		this.db.transaction(function (tx) {
			tx.executeSql('UPDATE words SET status=?, n_wrong=? WHERE id=?',
				['Wrong', BbsCardManager.curWord.n_wrong + 1, BbsCardManager.curWord.id]);
			BbsCardManager.getUnreadWord();
		}, this.dbError);	
	},
	
	resetAllWords: function()
	{
		this.db.transaction(function (tx) {
			tx.executeSql('UPDATE words SET status=NULL,n_correct=0,n_wrong=0', [], null, this.dbError);
		}, this.dbError);
	},
	
	getStats: function(onResult)
	{
		this.db.transaction(function (tx) {
			tx.executeSql('SELECT SUM(n_correct) AS c, SUM(n_wrong) AS w FROM words', [], function (tx, results) {
				var i = results.rows.item(0);
				var p = Math.round(i.c*100/(i.c + i.w));
				if (!p)
					p = 0;
				onResult(i, p);
			}, this.dbError);
		}, this.dbError);
	
	},

	displayStats: function()
	{
		this.getStats(function(i, p) {
			document.getElementById('statsTxt').innerHTML = p + '% (' + i.c + '/' + (i.w + i.c) + ') correct.';
			$.mobile.changePage('#stats', 'pop', true, true);
		});
	},
	
	displayScore: function()
	{
		this.getStats(function(i, p) {
			document.getElementById('rstTxt').innerHTML = 'You completed all the cards and got ' + p + '% correct.';
			BbsCardManager.resetAllWords();
			$.mobile.changePage($('#frnt'));
			$.mobile.changePage('#rst', 'pop', true, true);
		});
	}
};
