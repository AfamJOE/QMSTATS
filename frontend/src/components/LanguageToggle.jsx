import { useTranslation } from "react-i18next";

export default function LanguageToggle() {
  const { i18n } = useTranslation();

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="language-toggle">
      <button
        type="button"
        onClick={() => changeLanguage("en")}
        disabled={i18n.language?.startsWith("en")}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => changeLanguage("fr")}
        disabled={i18n.language?.startsWith("fr")}
      >
        FR
      </button>
    </div>
  );
}