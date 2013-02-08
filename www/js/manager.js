/*
 * Copyright (c) 2013 Geoffrey Derek Cox
 * This software is licensed under the MIT license. A copy of the license
 * should have been included with this software.
 */

var manager = (function() {

var pick_wrong_percent = 0.15, // how often to repeat wrong words
    words = null,
    unreadTranslationIndexes = [],
    wrongTranslationIndexes = [],
    curTranslation = null,
    curWord = null,
    curUnreadIndex = null,
    curWrongIndex = null,
    totalCorrect = 0,
    totalWrong = 0,
    dbInitialized = false,
    jqmReady = false,
    resetting = false,
    finished = false;

function nextTick(fn) {
	setTimeout(fn, 1);
}

function addWord(i) {
	if (i >= translations.length) { // No more to add?
		resetting = false;
		return;
	}
	words.get(translations[i][0], function(word) {
		var pushed = false;
		if (!word || resetting || word.correct === null) {
			if (resetting && word) {
				word.correct = null;
				word.nWrong = 0;
				words.save(word);
			}
			unreadTranslationIndexes.push(i);
			pushed = true;
		} else if (word.correct === true) {
			totalCorrect += 1;
		} else if (word.correct === false) {
			wrongTranslationIndexes.push(i);
			pushed = true;
			totalWrong += word.nWrong;
		}
		
		// First word or last word and all correct? Then display
		if (curTranslation === null
		    && (pushed || i === translations.length - 1)) {
			displayNextWord();
		}
		nextTick(function() {
			addWord(i + 1);
		});
	});
}

function initDb() {
	dbInitialized = true;
	// We need to specify the dom adapter as a bug in Lawnchair defaults the
	// adapter to window-name, which is not persistent
	Lawnchair({name: 'words', record: 'word', adapter: 'dom'}, function(theWords) {
		words = theWords;
		addWord(0);
	});
}

function hideWord() {
	if (!jqmReady)
		return;
	$('#frnt-word, #bck-word').css({display: "none"});
}

function displayWord() {
	if (!jqmReady || !curTranslation)
		return;
	$('#frnt-word').html(curTranslation[2]);
	$('#bck-word').html(curTranslation[1]);
	$('#frnt-word, #bck-word').css({display: "inline"});
}

function getRandomIndex(a) {
	return Math.floor(Math.random()*a.length);
}

function displayNextWord() {
	var i = 0;
	var transIndex = 0;
	if (unreadTranslationIndexes.length === 0
	    && wrongTranslationIndexes.length === 0) { // all correct?
		finish();
	} else {
		if (wrongTranslationIndexes.length > 0
		    && (Math.random() < pick_wrong_percent
			|| unreadTranslationIndexes.length == 0)) { // repeat a wrong word?
			i = getRandomIndex(wrongTranslationIndexes);
			transIndex = wrongTranslationIndexes[i];
			curUnreadIndex = null;
			curWrongIndex = i;
		} else { // get unread word?
			i = getRandomIndex(unreadTranslationIndexes);
			transIndex = unreadTranslationIndexes[i];
			curUnreadIndex = i;
			curWrongIndex = null;
		}
		curTranslation = translations[transIndex];
		words.get(curTranslation[0], function(word) {
			if (word) {
				curWord = word;
			} else { // unread?
				curWord = {
					key: curTranslation[0],
					correct: null,
					nWrong: 0
				};
			}
			displayWord();
			manager.goToFrntPage();
		});
	}
}

function deleteCurUnreadOrWrong() {
	if (curUnreadIndex !== null) {
		unreadTranslationIndexes.splice(curUnreadIndex, 1);
	} else {
		wrongTranslationIndexes.splice(curWrongIndex, 1);
	}
}

function getCorrectPercent() {
	if (totalCorrect === 0 && totalWrong === 0) {
		return 0;
	} else {
		return Math.round(totalCorrect*100/(totalWrong + totalCorrect));
	}
}

function resetAllWords() {
	curTranslation = null;
	unreadTranslationIndexes = [];
	wrongTranslationIndexes = [];
	totalCorrect = 0;
	totalWrong = 0;
	resetting = true;
	addWord(0);
}

function finish() {
	var p = getCorrectPercent();
	$('#rstTxt').html('You completed all the cards and got ' + p + '% correct!');
	finished = true;
	resetAllWords();
}

return {

	mobileInit: function() {
		$(document).bind('mobileinit', function() {
			//$.mobile.defaultPageTransition = 'flip'; // A little jerky
			$.mobile.defaultPageTransition = 'none';
		});
	},

	initialize: function() {
		// Prevent a swiping bug
		$(document).on('ontouchmove', function(event) {
			event.preventDefault();
		});
		$(document).on('swipeleft', function() {
			$.mobile.changePage($('#bck'), {transition: 'slide'});
		});
		$(document).on('swiperight', function() {
			$.mobile.changePage($('#frnt'), {transition: 'slide', reverse: true});
		});

		// We have to hide the word before the change and then show it afterwards,
		// otherwise the word will jump around while JQM positions the headers and
		// footers.
		$(document).on('pagebeforechange', function() {
			hideWord();
		});
		$(document).on('pagechange', function() {
			displayWord();

			// $.mobile.activePage.attr('id') isn't actually ready until the 1st pagechange event is fired
			jqmReady = true;
			if (!dbInitialized) {
				initDb();
			}
			
			if (finished
			    && $.mobile.activePage.attr('id') === 'frnt') {
				finished = false;
				
				// A bug in JQM causes the reset popup to immediately close unless we open
				// the popup on the next tick
				nextTick(function() {
					$.mobile.changePage('#rst');
				});
			}
		});
	},

	goToFrntPage: function() {
		$('#frnt-word').html('');
		if ($.mobile.activePage.attr('id') === 'frnt') {
			displayWord();
		} else {
			$.mobile.changePage($('#frnt'));
		}
	},
	
	flip: function() {
		if ($.mobile.activePage.attr('id') === 'frnt') {
			$.mobile.changePage($('#bck'));
		} else {
			$.mobile.changePage($('#frnt'));
		}
	},
	
	displayStats: function() {
		var p = getCorrectPercent();
		$('#statsTxt').html(p + '% (' + totalCorrect + '/' + (totalWrong + totalCorrect) + ') correct.');
		$.mobile.changePage('#stats');
	},

	markAsCorrect: function() {
		totalCorrect += 1;
		curWord.correct = true;
		words.save(curWord, function() {
			deleteCurUnreadOrWrong();
			displayNextWord();
		});
	},
	
	markAsWrong: function() {
		totalWrong += 1;
		curWord.correct = false;
		curWord.nWrong += 1;
		words.save(curWord, function() {
			if (curUnreadIndex !== null) { // cur word is an unread word?
				wrongTranslationIndexes.push(unreadTranslationIndexes[curUnreadIndex]);
				deleteCurUnreadOrWrong();
			}
			displayNextWord();
		});
	},
	
	resetAndGoToFrnt: function() {
		resetAllWords();
		this.goToFrntPage();
	}
};

})();